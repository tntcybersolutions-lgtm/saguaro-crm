'use client';
/**
 * Saguaro Field — T&M Tickets (Time & Material)
 * Create, view, approve, and dispute T&M tickets from the field.
 * Canvas-based signature capture, photo documentation, offline queue.
 */
import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import EmailComposer from '@/components/EmailComposer';
import { TRADESPERSON_ROLES as TRADES } from '@/lib/contractor-trades';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const STATUS_COLORS: Record<string, string> = { draft: DIM, submitted: AMBER, approved: GREEN, disputed: RED };
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', disputed: 'Disputed' };

// TRADES imported from @/lib/contractor-trades (as TRADESPERSON_ROLES)
const UNITS = ['EA', 'LF', 'SF', 'CY', 'TON', 'GAL', 'LS', 'HR', 'BAG', 'ROLL', 'SHEET', 'BOX'];

interface LaborLine {
  id: string; worker: string; trade: string; regHours: number; otHours: number; rate: number;
}
interface MaterialLine {
  id: string; description: string; qty: number; unit: string; unitCost: number;
}
interface EquipmentLine {
  id: string; description: string; hours: number; rate: number;
}
interface TMTicket {
  id: string;
  ticket_number?: number;
  date: string;
  description: string;
  reference?: string;
  status: string;
  labor: LaborLine[];
  materials: MaterialLine[];
  equipment: EquipmentLine[];
  markup_pct: number;
  tax_pct: number;
  photos?: string[];
  contractor_signature?: string;
  owner_signature?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

type View = 'list' | 'detail' | 'create';

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}
function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
function calcLaborTotal(lines: LaborLine[]): number {
  return lines.reduce((s, l) => s + (l.regHours * l.rate) + (l.otHours * l.rate * 1.5), 0);
}
function calcMaterialTotal(lines: MaterialLine[]): number {
  return lines.reduce((s, m) => s + (m.qty * m.unitCost), 0);
}
function calcEquipmentTotal(lines: EquipmentLine[]): number {
  return lines.reduce((s, e) => s + (e.hours * e.rate), 0);
}
function calcSubtotal(t: { labor: LaborLine[]; materials: MaterialLine[]; equipment: EquipmentLine[] }): number {
  return calcLaborTotal(t.labor) + calcMaterialTotal(t.materials) + calcEquipmentTotal(t.equipment);
}
function calcMarkup(subtotal: number, pct: number): number { return subtotal * (pct / 100); }
function calcTax(subtotal: number, markup: number, pct: number): number { return (subtotal + markup) * (pct / 100); }
function calcGrandTotal(t: { labor: LaborLine[]; materials: MaterialLine[]; equipment: EquipmentLine[] }, markupPct: number, taxPct: number): number {
  const sub = calcSubtotal(t);
  const mk = calcMarkup(sub, markupPct);
  const tx = calcTax(sub, mk, taxPct);
  return sub + mk + tx;
}

// ─── Signature Pad Component ──────────────────────────────────
function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const moveDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !lastPos.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, [getPos]);

  const endDraw = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  const clearSig = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange('');
  }, [onChange]);

  // If a saved value exists, draw it back
  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current!.getContext('2d')!;
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={lbl}>{label}</label>
        <button type="button" onClick={clearSig} style={{ background: 'none', border: 'none', color: RED, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Clear</button>
      </div>
      <div style={{ background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          style={{ width: '100%', height: 120, display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
      </div>
      {value ? (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: GREEN, fontWeight: 600 }}>Signature captured</p>
      ) : (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: DIM }}>Sign above using finger or mouse</p>
      )}
    </div>
  );
}

// ─── Main T&M Tickets Page ──────────────────────────────────
const exportPDF = (title: string, content: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 24px; border-bottom: 2px solid #D4A017; padding-bottom: 8px; }
        h2 { font-size: 18px; color: #333; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .meta { color: #666; font-size: 13px; }
        .section { margin: 16px 0; padding: 12px; border: 1px solid #eee; border-radius: 8px; }
        img { max-width: 300px; margin: 4px; border-radius: 4px; }
        .signature { max-width: 200px; border: 1px solid #ddd; border-radius: 4px; padding: 4px; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
        .text-right { text-align: right; }
        .bold { font-weight: 700; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      ${content}
      <div class="footer">
        <p>Generated by Saguaro Control &middot; ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><polyline points="9 15 12 12 15 15"/>
  </svg>
);

function TMTicketsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [tickets, setTickets] = useState<TMTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<TMTicket | null>(null);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState('all');
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllTickets = () => setSelectedIds(new Set(filtered.map(t => t.id)));
  const deselectAllTickets = () => setSelectedIds(new Set());

  // Create form state
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDesc, setFormDesc] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formLabor, setFormLabor] = useState<LaborLine[]>([{ id: uid(), worker: '', trade: 'General Labor', regHours: 0, otHours: 0, rate: 0 }]);
  const [formMaterials, setFormMaterials] = useState<MaterialLine[]>([{ id: uid(), description: '', qty: 0, unit: 'EA', unitCost: 0 }]);
  const [formEquipment, setFormEquipment] = useState<EquipmentLine[]>([{ id: uid(), description: '', hours: 0, rate: 0 }]);
  const [formMarkup, setFormMarkup] = useState(15);
  const [formTax, setFormTax] = useState(0);
  const [formPhotos, setFormPhotos] = useState<File[]>([]);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string[]>([]);
  const [contractorSig, setContractorSig] = useState('');
  const [ownerSig, setOwnerSig] = useState('');

  // Online/offline detection
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load project name + tickets
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadTickets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/tm-tickets`);
      const d = await r.json();
      setTickets(d.tm_tickets || d.tickets || d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  // ─── Photo capture ──────────────────────
  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    setFormPhotos((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setFormPhotoPreview((prev) => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const removePhoto = useCallback((idx: number) => {
    setFormPhotos((prev) => prev.filter((_, i) => i !== idx));
    setFormPhotoPreview((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ─── Dynamic row helpers ──────────────────────
  const addLabor = () => setFormLabor((p) => [...p, { id: uid(), worker: '', trade: 'General Labor', regHours: 0, otHours: 0, rate: 0 }]);
  const removeLabor = (id: string) => setFormLabor((p) => p.length > 1 ? p.filter((l) => l.id !== id) : p);
  const updateLabor = (id: string, field: keyof LaborLine, val: string | number) =>
    setFormLabor((p) => p.map((l) => l.id === id ? { ...l, [field]: val } : l));

  const addMaterial = () => setFormMaterials((p) => [...p, { id: uid(), description: '', qty: 0, unit: 'EA', unitCost: 0 }]);
  const removeMaterial = (id: string) => setFormMaterials((p) => p.length > 1 ? p.filter((m) => m.id !== id) : p);
  const updateMaterial = (id: string, field: keyof MaterialLine, val: string | number) =>
    setFormMaterials((p) => p.map((m) => m.id === id ? { ...m, [field]: val } : m));

  const addEquipment = () => setFormEquipment((p) => [...p, { id: uid(), description: '', hours: 0, rate: 0 }]);
  const removeEquipment = (id: string) => setFormEquipment((p) => p.length > 1 ? p.filter((e2) => e2.id !== id) : p);
  const updateEquipment = (id: string, field: keyof EquipmentLine, val: string | number) =>
    setFormEquipment((p) => p.map((e2) => e2.id === id ? { ...e2, [field]: val } : e2));

  // ─── Create ticket ──────────────────────
  const resetForm = () => {
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormDesc(''); setFormRef(''); setFormNotes('');
    setFormLabor([{ id: uid(), worker: '', trade: 'General Labor', regHours: 0, otHours: 0, rate: 0 }]);
    setFormMaterials([{ id: uid(), description: '', qty: 0, unit: 'EA', unitCost: 0 }]);
    setFormEquipment([{ id: uid(), description: '', hours: 0, rate: 0 }]);
    setFormMarkup(15); setFormTax(0);
    setFormPhotos([]); setFormPhotoPreview([]);
    setContractorSig(''); setOwnerSig('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesc.trim()) return;
    setSaving(true);

    const payload = {
      projectId,
      date: formDate,
      description: formDesc.trim(),
      reference: formRef.trim() || undefined,
      notes: formNotes.trim() || undefined,
      labor: formLabor.filter((l) => l.worker.trim()),
      materials: formMaterials.filter((m) => m.description.trim()),
      equipment: formEquipment.filter((eq) => eq.description.trim()),
      markup_pct: formMarkup,
      tax_pct: formTax,
      contractor_signature: contractorSig || undefined,
      owner_signature: ownerSig || undefined,
      status: contractorSig ? 'submitted' : 'draft',
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/tm-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const newTicket: TMTicket = {
        id: data.id || `temp-${Date.now()}`,
        ticket_number: (tickets.length + 1),
        ...payload,
        labor: payload.labor as LaborLine[],
        materials: payload.materials as MaterialLine[],
        equipment: payload.equipment as EquipmentLine[],
        created_at: new Date().toISOString(),
      };
      setTickets((prev) => [newTicket, ...prev]);
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/tm-tickets`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newTicket: TMTicket = {
        id: `queued-${Date.now()}`,
        ticket_number: (tickets.length + 1),
        ...payload,
        labor: payload.labor as LaborLine[],
        materials: payload.materials as MaterialLine[],
        equipment: payload.equipment as EquipmentLine[],
        created_at: new Date().toISOString(),
      };
      setTickets((prev) => [newTicket, ...prev]);
    }

    resetForm();
    setSaving(false);
    setView('list');
  };

  // ─── Status actions ──────────────────────
  const handleStatusChange = async (ticket: TMTicket, newStatus: string) => {
    setActionLoading(true);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/tm-tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setActionMsg(`Ticket ${STATUS_LABELS[newStatus] || newStatus}`);
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/tm-tickets/${ticket.id}`,
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg(`Status update queued \u2014 will sync when online`);
    }
    const updated = { ...ticket, status: newStatus, updated_at: new Date().toISOString() };
    setSelected(updated);
    setTickets((prev) => prev.map((t) => t.id === ticket.id ? updated : t));
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  // ─── Computed values ──────────────────────
  const filtered = (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter))
    .filter((t) => !searchQuery || t.description.toLowerCase().includes(searchQuery.toLowerCase())
      || (t.ticket_number && `TM-${t.ticket_number}`.toLowerCase().includes(searchQuery.toLowerCase()))
      || (t.reference && t.reference.toLowerCase().includes(searchQuery.toLowerCase())));

  const totalValue = tickets.reduce((s, t) => s + calcGrandTotal(t, t.markup_pct || 0, t.tax_pct || 0), 0);
  const approvedValue = tickets.filter((t) => t.status === 'approved').reduce((s, t) => s + calcGrandTotal(t, t.markup_pct || 0, t.tax_pct || 0), 0);
  const pendingCount = tickets.filter((t) => t.status === 'submitted').length;

  const formSubtotal = calcSubtotal({ labor: formLabor, materials: formMaterials, equipment: formEquipment });
  const formMarkupAmt = calcMarkup(formSubtotal, formMarkup);
  const formTaxAmt = calcTax(formSubtotal, formMarkupAmt, formTax);
  const formGrandTotal = formSubtotal + formMarkupAmt + formTaxAmt;

  const handleBulkSubmit = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        if (!online) throw new Error('offline');
        await fetch(`/api/projects/${projectId}/tm-tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'submitted' }),
        });
      } catch {
        await enqueue({
          url: `/api/projects/${projectId}/tm-tickets/${id}`,
          method: 'PATCH',
          body: JSON.stringify({ status: 'submitted' }),
          contentType: 'application/json',
          isFormData: false,
        });
      }
    }
    setTickets(prev => prev.map(t => ids.includes(t.id) ? { ...t, status: 'submitted', updated_at: new Date().toISOString() } : t));
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setActionMsg(`${ids.length} ticket(s) submitted`);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleBulkApprove = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        if (!online) throw new Error('offline');
        await fetch(`/api/projects/${projectId}/tm-tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        });
      } catch {
        await enqueue({
          url: `/api/projects/${projectId}/tm-tickets/${id}`,
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
          contentType: 'application/json',
          isFormData: false,
        });
      }
    }
    setTickets(prev => prev.map(t => ids.includes(t.id) ? { ...t, status: 'approved', updated_at: new Date().toISOString() } : t));
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setActionMsg(`${ids.length} ticket(s) approved`);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleBulkExportTickets = async () => {
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/tm-tickets/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ids: ids }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tm-tickets-export-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setActionMsg(`${ids.length} ticket(s) exported`);
      } else {
        setActionMsg('Export failed');
      }
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/tm-tickets/export`,
        method: 'POST',
        body: JSON.stringify({ ticket_ids: ids }),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg('Export queued — will download when online');
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  // ═══════════════════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div style={{ padding: '18px 16px', maxWidth: 900, margin: '0 auto' }}>
        <button onClick={() => router.back()} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>T&M Tickets</h1>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>{projectName || 'Time & Material Tracking'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {tickets.length > 0 && (
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }} style={{
                background: selectMode ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${selectMode ? GOLD : BORDER}`,
                borderRadius: 10, padding: '10px 14px', color: selectMode ? GOLD : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
            <button onClick={() => { resetForm(); setView('create'); }} style={{
              background: GOLD, border: 'none', borderRadius: 10, padding: '10px 16px',
              color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
            }}>
              + New T&M
            </button>
          </div>
        </div>

        {!online && <OfflineBanner />}

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          <StatCard label="Total Value" value={formatUSD(totalValue)} color={GOLD} />
          <StatCard label="Approved" value={formatUSD(approvedValue)} color={GREEN} />
          <StatCard label="Pending" value={String(pendingCount)} color={AMBER} />
          <StatCard label="Tickets" value={String(tickets.length)} color={BLUE} />
        </div>

        {/* Search */}
        <div style={{ marginBottom: 10 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets..."
            style={{ ...inp, fontSize: 13, padding: '9px 14px' }}
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {['all', 'draft', 'submitted', 'approved', 'disputed'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ flexShrink: 0, background: filter === f ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${filter === f ? GOLD : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filter === f ? GOLD : DIM, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {f === 'all' ? 'All' : STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>

        {selectMode && filtered.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <button onClick={selectedIds.size === filtered.length ? deselectAllTickets : selectAllTickets} style={{
              background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8,
              padding: '6px 14px', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
            </button>
            <span style={{ fontSize: 12, color: DIM }}>{selectedIds.size} selected</span>
          </div>
        )}

        {actionMsg && !selectMode && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading T&M tickets...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                <rect x={2} y={3} width={20} height={18} rx={2} /><line x1={8} y1={9} x2={16} y2={9}/><line x1={8} y1={13} x2={13} y2={13}/><line x1={8} y1={17} x2={10} y2={17}/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>{filter === 'all' && !searchQuery ? 'No T&M tickets yet. Tap "+ New T&M" to create one.' : 'No tickets match your filter.'}</p>
          </div>
        ) : (
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((t) => {
              const sc = STATUS_COLORS[t.status] || DIM;
              const gt = calcGrandTotal(t, t.markup_pct || 0, t.tax_pct || 0);
              const laborCount = (t.labor || []).length;
              const materialCount = (t.materials || []).length;
              const equipCount = (t.equipment || []).length;
              const isChecked = selectedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => selectMode ? toggleSelectId(t.id) : (() => { setSelected(t); setView('detail'); setActionMsg(''); })()}
                  style={{
                    background: isChecked ? 'rgba(212,160,23,.06)' : RAISED,
                    border: `1px solid ${isChecked ? GOLD : BORDER}`,
                    borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    {selectMode && (
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, border: `2px solid ${isChecked ? GOLD : BORDER}`,
                        background: isChecked ? GOLD : 'transparent', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, marginTop: 2,
                      }}>
                        {isChecked && <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        {t.ticket_number != null && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '2px 8px', borderRadius: 6 }}>
                            TM-{String(t.ticket_number).padStart(3, '0')}
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `rgba(${hexRgb(sc)},.12)`, color: sc,
                        }}>
                          {STATUS_LABELS[t.status] || t.status}
                        </span>
                        <span style={{ fontSize: 11, color: DIM }}>{formatDate(t.date || t.created_at)}</span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>{formatUSD(gt)}</span>
                        {t.reference && <span style={{ fontSize: 11, color: DIM }}>Ref: {t.reference}</span>}
                        <span style={{ fontSize: 11, color: DIM }}>
                          {laborCount > 0 && `${laborCount} labor`}{materialCount > 0 && ` \u00B7 ${materialCount} material`}{equipCount > 0 && ` \u00B7 ${equipCount} equip`}
                        </span>
                      </div>
                    </div>
                    {!selectMode && <span style={{ color: DIM, fontSize: 18, flexShrink: 0, marginTop: 4 }}>{'\u203A'}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bulk Action Bar */}
          {selectMode && selectedIds.size > 0 && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0A1929',
              borderTop: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', gap: 8,
              justifyContent: 'center', zIndex: 100,
            }}>
              <button onClick={() => setConfirmDialog({
                title: 'Submit Selected Tickets',
                message: `Submit ${selectedIds.size} ticket(s) for review?`,
                action: handleBulkSubmit,
              })} disabled={bulkProcessing} style={{
                background: 'rgba(245,158,11,.15)', border: `1px solid rgba(245,158,11,.3)`, borderRadius: 10,
                padding: '10px 14px', color: AMBER, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
              }}>
                Submit ({selectedIds.size})
              </button>
              <button onClick={() => setConfirmDialog({
                title: 'Approve Selected Tickets',
                message: `Approve ${selectedIds.size} ticket(s)?`,
                action: handleBulkApprove,
              })} disabled={bulkProcessing} style={{
                background: 'rgba(34,197,94,.15)', border: `1px solid rgba(34,197,94,.3)`, borderRadius: 10,
                padding: '10px 14px', color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
              }}>
                Approve ({selectedIds.size})
              </button>
              <button onClick={() => handleBulkExportTickets()} disabled={bulkProcessing} style={{
                background: 'rgba(212,160,23,.15)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10,
                padding: '10px 14px', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1,
              }}>
                Export ({selectedIds.size})
              </button>
            </div>
          )}

          {/* Confirmation Dialog */}
          {confirmDialog && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
            }}>
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: TEXT }}>{confirmDialog.title}</h3>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: DIM, lineHeight: 1.5 }}>{confirmDialog.message}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmDialog(null)} style={{
                    flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10,
                    padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={() => { confirmDialog.action(); setConfirmDialog(null); }} disabled={bulkProcessing} style={{
                    flex: 1, background: GOLD, border: 'none', borderRadius: 10,
                    padding: '12px', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}>{bulkProcessing ? 'Processing...' : 'Confirm'}</button>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'detail' && selected) {
    const sc = STATUS_COLORS[selected.status] || DIM;
    const selLabor = selected.labor || [];
    const selMat = selected.materials || [];
    const selEquip = selected.equipment || [];
    const selSub = calcSubtotal(selected);
    const selMk = calcMarkup(selSub, selected.markup_pct || 0);
    const selTx = calcTax(selSub, selMk, selected.tax_pct || 0);
    const selGrand = selSub + selMk + selTx;

    return (
      <div style={{ padding: '18px 16px', maxWidth: 900, margin: '0 auto' }}>
        <button onClick={() => { setView('list'); setActionMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          {selected.ticket_number != null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '3px 10px', borderRadius: 6 }}>
              TM-{String(selected.ticket_number).padStart(3, '0')}
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(sc)},.12)`, color: sc,
          }}>
            {STATUS_LABELS[selected.status] || selected.status}
          </span>
          <span style={{ fontSize: 12, color: DIM }}>{formatDate(selected.date || selected.created_at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selected.description}</h1>
            {selected.reference && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Reference/PO: {selected.reference}</p>}
            <p style={{ margin: '0 0 16px', fontSize: 28, fontWeight: 800, color: GOLD }}>{formatUSD(selGrand)}</p>
          </div>
          <button onClick={() => {
            const t = selected;
            const laborHtml = (t.labor || []).map(l =>
              `<tr><td>${l.worker}</td><td>${l.trade}</td><td class="text-right">${l.regHours}</td><td class="text-right">${l.otHours}</td><td class="text-right">${formatUSD(l.rate)}</td><td class="text-right bold">${formatUSD((l.regHours * l.rate) + (l.otHours * l.rate * 1.5))}</td></tr>`
            ).join('');
            const matHtml = (t.materials || []).map(m =>
              `<tr><td>${m.description}</td><td class="text-right">${m.qty}</td><td>${m.unit}</td><td class="text-right">${formatUSD(m.unitCost)}</td><td class="text-right bold">${formatUSD(m.qty * m.unitCost)}</td></tr>`
            ).join('');
            const equipHtml = (t.equipment || []).map(e =>
              `<tr><td>${e.description}</td><td class="text-right">${e.hours}</td><td class="text-right">${formatUSD(e.rate)}</td><td class="text-right bold">${formatUSD(e.hours * e.rate)}</td></tr>`
            ).join('');
            const photosHtml = (t.photos || []).map(url =>
              `<img src="${url}" alt="T&M photo" />`
            ).join('');
            exportPDF(`TM-${t.ticket_number ? String(t.ticket_number).padStart(3, '0') : ''} ${t.description}`, `
              <h1>T&M Ticket${t.ticket_number != null ? ' #TM-' + String(t.ticket_number).padStart(3, '0') : ''}</h1>
              <table>
                <tr><th>Description</th><td>${t.description}</td></tr>
                <tr><th>Date</th><td>${formatDate(t.date || t.created_at)}</td></tr>
                <tr><th>Status</th><td><span class="badge">${STATUS_LABELS[t.status] || t.status}</span></td></tr>
                ${t.reference ? `<tr><th>Reference/PO</th><td>${t.reference}</td></tr>` : ''}
              </table>
              ${(t.labor || []).length > 0 ? `
                <h2>Labor</h2>
                <table><tr><th>Worker</th><th>Trade</th><th>Reg Hrs</th><th>OT Hrs</th><th>Rate</th><th>Total</th></tr>${laborHtml}
                <tr><td colspan="5" class="text-right bold">Labor Subtotal</td><td class="text-right bold">${formatUSD(calcLaborTotal(t.labor))}</td></tr></table>
              ` : ''}
              ${(t.materials || []).length > 0 ? `
                <h2>Materials</h2>
                <table><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr>${matHtml}
                <tr><td colspan="4" class="text-right bold">Materials Subtotal</td><td class="text-right bold">${formatUSD(calcMaterialTotal(t.materials))}</td></tr></table>
              ` : ''}
              ${(t.equipment || []).length > 0 ? `
                <h2>Equipment</h2>
                <table><tr><th>Description</th><th>Hours</th><th>Rate</th><th>Total</th></tr>${equipHtml}
                <tr><td colspan="3" class="text-right bold">Equipment Subtotal</td><td class="text-right bold">${formatUSD(calcEquipmentTotal(t.equipment))}</td></tr></table>
              ` : ''}
              <h2>Totals</h2>
              <table>
                <tr><th>Subtotal</th><td class="text-right">${formatUSD(selSub)}</td></tr>
                ${t.markup_pct ? `<tr><th>Markup (${t.markup_pct}%)</th><td class="text-right">${formatUSD(selMk)}</td></tr>` : ''}
                ${t.tax_pct ? `<tr><th>Tax (${t.tax_pct}%)</th><td class="text-right">${formatUSD(selTx)}</td></tr>` : ''}
                <tr><th class="bold">Grand Total</th><td class="text-right bold" style="font-size:16px">${formatUSD(selGrand)}</td></tr>
              </table>
              ${t.notes ? `<h2>Notes</h2><div class="section"><p>${t.notes.replace(/\n/g, '<br/>')}</p></div>` : ''}
              ${photosHtml ? `<h2>Photos</h2>${photosHtml}` : ''}
              ${t.contractor_signature ? `<h2>Contractor Signature</h2><img class="signature" src="${t.contractor_signature}" alt="Contractor Signature" />` : ''}
              ${t.owner_signature ? `<h2>Owner Signature</h2><img class="signature" src="${t.owner_signature}" alt="Owner Signature" />` : ''}
            `);
          }} style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '8px 14px', color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <PdfIcon /> Export PDF
          </button>
          <button onClick={() => setShowEmail(true)} style={{
            background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 10,
            padding: '8px 14px', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Email Ticket
          </button>
        </div>

        {showEmail && (
          <EmailComposer
            projectId={projectId}
            onClose={() => setShowEmail(false)}
            onSent={() => { setShowEmail(false); setActionMsg('Email sent successfully'); setTimeout(() => setActionMsg(''), 3500); }}
            defaultSubject={`T&M Ticket #${selected.ticket_number != null ? String(selected.ticket_number).padStart(3, '0') : ''} - ${selected.description}`}
            defaultBody={[
              `T&M Ticket${selected.ticket_number != null ? ' #' + String(selected.ticket_number).padStart(3, '0') : ''}`,
              `Description: ${selected.description}`,
              `Status: ${STATUS_LABELS[selected.status] || selected.status}`,
              `Date: ${formatDate(selected.date || selected.created_at)}`,
              selected.reference ? `Reference/PO: ${selected.reference}` : '',
              '',
              `Labor: ${formatUSD(calcLaborTotal(selLabor))} (${selLabor.length} worker${selLabor.length !== 1 ? 's' : ''})`,
              `Materials: ${formatUSD(calcMaterialTotal(selMat))} (${selMat.length} item${selMat.length !== 1 ? 's' : ''})`,
              `Equipment: ${formatUSD(calcEquipmentTotal(selEquip))} (${selEquip.length} item${selEquip.length !== 1 ? 's' : ''})`,
              `Subtotal: ${formatUSD(selSub)}`,
              (selected.markup_pct || 0) > 0 ? `Markup (${selected.markup_pct}%): ${formatUSD(selMk)}` : '',
              (selected.tax_pct || 0) > 0 ? `Tax (${selected.tax_pct}%): ${formatUSD(selTx)}` : '',
              `Grand Total: ${formatUSD(selGrand)}`,
              '',
              `Contractor Signature: ${selected.contractor_signature ? 'Signed' : 'Pending'}`,
              `Owner Signature: ${selected.owner_signature ? 'Signed' : 'Pending'}`,
              selected.notes ? `\nNotes:\n${selected.notes}` : '',
            ].filter(Boolean).join('\n')}
            module="tm_tickets"
            itemId={selected.id}
            itemTitle={selected.description}
          />
        )}

        {actionMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {!online && <OfflineBanner />}

        {/* Labor Section */}
        {selLabor.length > 0 && (
          <div style={card}>
            <p style={secLbl}>Labor ({selLabor.length} {selLabor.length === 1 ? 'worker' : 'workers'})</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>Worker</th><th style={th}>Trade</th><th style={thR}>Reg Hrs</th><th style={thR}>OT Hrs</th><th style={thR}>Rate</th><th style={thR}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selLabor.map((l, i) => {
                    const lineTotal = (l.regHours * l.rate) + (l.otHours * l.rate * 1.5);
                    return (
                      <tr key={l.id || i} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={td}>{l.worker}</td>
                        <td style={td}>{l.trade}</td>
                        <td style={tdR}>{l.regHours}</td>
                        <td style={tdR}>{l.otHours > 0 ? l.otHours : '\u2014'}</td>
                        <td style={tdR}>{formatUSD(l.rate)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: GOLD }}>{formatUSD(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                    <td colSpan={5} style={{ ...td, fontWeight: 800, color: GOLD }}>Labor Subtotal</td>
                    <td style={{ ...tdR, fontWeight: 800, color: GOLD }}>{formatUSD(calcLaborTotal(selLabor))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Materials Section */}
        {selMat.length > 0 && (
          <div style={card}>
            <p style={secLbl}>Materials ({selMat.length} {selMat.length === 1 ? 'item' : 'items'})</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>Description</th><th style={thR}>Qty</th><th style={thR}>Unit</th><th style={thR}>Unit Cost</th><th style={thR}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selMat.map((m, i) => (
                    <tr key={m.id || i} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={td}>{m.description}</td>
                      <td style={tdR}>{m.qty}</td>
                      <td style={tdR}>{m.unit}</td>
                      <td style={tdR}>{formatUSD(m.unitCost)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: GOLD }}>{formatUSD(m.qty * m.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                    <td colSpan={4} style={{ ...td, fontWeight: 800, color: GOLD }}>Materials Subtotal</td>
                    <td style={{ ...tdR, fontWeight: 800, color: GOLD }}>{formatUSD(calcMaterialTotal(selMat))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Equipment Section */}
        {selEquip.length > 0 && (
          <div style={card}>
            <p style={secLbl}>Equipment ({selEquip.length} {selEquip.length === 1 ? 'item' : 'items'})</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={th}>Description</th><th style={thR}>Hours</th><th style={thR}>Rate</th><th style={thR}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selEquip.map((eq, i) => (
                    <tr key={eq.id || i} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={td}>{eq.description}</td>
                      <td style={tdR}>{eq.hours}</td>
                      <td style={tdR}>{formatUSD(eq.rate)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: GOLD }}>{formatUSD(eq.hours * eq.rate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                    <td colSpan={3} style={{ ...td, fontWeight: 800, color: GOLD }}>Equipment Subtotal</td>
                    <td style={{ ...tdR, fontWeight: 800, color: GOLD }}>{formatUSD(calcEquipmentTotal(selEquip))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Grand Total Card */}
        <div style={{ ...card, background: 'linear-gradient(135deg, #0D1D2E 0%, #142A40 100%)' }}>
          <p style={secLbl}>Ticket Summary</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: TEXT, fontSize: 14 }}>Subtotal</span>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{formatUSD(selSub)}</span>
          </div>
          {(selected.markup_pct || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ color: DIM, fontSize: 14 }}>Markup ({selected.markup_pct}%)</span>
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{formatUSD(selMk)}</span>
            </div>
          )}
          {(selected.tax_pct || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ color: DIM, fontSize: 14 }}>Tax ({selected.tax_pct}%)</span>
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{formatUSD(selTx)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', borderTop: `2px solid ${GOLD}`, marginTop: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>Grand Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{formatUSD(selGrand)}</span>
          </div>
        </div>

        {/* Signatures */}
        {(selected.contractor_signature || selected.owner_signature) && (
          <div style={card}>
            <p style={secLbl}>Signatures</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {selected.contractor_signature && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM, fontWeight: 600 }}>Contractor</p>
                  <div style={{ background: '#07101C', borderRadius: 8, padding: 4, border: `1px solid ${BORDER}` }}>
                    <img src={selected.contractor_signature} alt="Contractor signature" style={{ width: '100%', height: 60, objectFit: 'contain' }} />
                  </div>
                </div>
              )}
              {selected.owner_signature && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM, fontWeight: 600 }}>Owner / GC Rep</p>
                  <div style={{ background: '#07101C', borderRadius: 8, padding: 4, border: `1px solid ${BORDER}` }}>
                    <img src={selected.owner_signature} alt="Owner signature" style={{ width: '100%', height: 60, objectFit: 'contain' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {selected.notes && (
          <div style={card}>
            <p style={secLbl}>Notes</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.notes}</p>
          </div>
        )}

        {/* Photos */}
        {selected.photos && selected.photos.length > 0 && (
          <div style={card}>
            <p style={secLbl}>Photos ({selected.photos.length})</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {selected.photos.map((photo, i) => (
                <img key={i} src={photo} alt={`T&M photo ${i + 1}`} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
              ))}
            </div>
          </div>
        )}

        {/* Status Action Buttons */}
        <div style={card}>
          <p style={secLbl}>Actions</p>
          {selected.status === 'draft' && (
            <button onClick={() => handleStatusChange(selected, 'submitted')} disabled={actionLoading}
              style={{ ...actionBtnStyle, background: actionLoading ? '#1E3A5F' : AMBER, color: actionLoading ? DIM : '#000', marginBottom: 10 }}>
              {actionLoading ? 'Processing...' : 'Submit for Approval'}
            </button>
          )}
          {selected.status === 'submitted' && (
            <>
              <button onClick={() => handleStatusChange(selected, 'approved')} disabled={actionLoading}
                style={{ ...actionBtnStyle, background: actionLoading ? '#1E3A5F' : GREEN, color: actionLoading ? DIM : '#000', marginBottom: 10 }}>
                {actionLoading ? 'Processing...' : 'Approve Ticket'}
              </button>
              <button onClick={() => handleStatusChange(selected, 'disputed')} disabled={actionLoading}
                style={{ ...actionBtnStyle, background: actionLoading ? '#1E3A5F' : RED, color: actionLoading ? DIM : '#fff' }}>
                {actionLoading ? 'Processing...' : 'Dispute Ticket'}
              </button>
            </>
          )}
          {selected.status === 'disputed' && (
            <button onClick={() => handleStatusChange(selected, 'submitted')} disabled={actionLoading}
              style={{ ...actionBtnStyle, background: actionLoading ? '#1E3A5F' : AMBER, color: actionLoading ? DIM : '#000' }}>
              {actionLoading ? 'Processing...' : 'Resubmit Ticket'}
            </button>
          )}
          {selected.status === 'approved' && (
            <p style={{ margin: 0, fontSize: 14, color: GREEN, fontWeight: 600, textAlign: 'center', padding: '8px 0' }}>
              This ticket has been approved.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '18px 16px', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={() => setView('list')} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: GOLD }}>New T&M Ticket</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Document time & materials for this project</p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleCreate}>
        {/* ── Ticket Info ── */}
        <div style={card}>
          <p style={secLbl}>Ticket Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inp} required />
            </div>
            <div>
              <label style={lbl}>Reference / PO #</label>
              <input value={formRef} onChange={(e) => setFormRef(e.target.value)} placeholder="PO-12345" style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Description *</label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Describe the T&M work performed..." rows={3} style={inp} required />
          </div>
        </div>

        {/* ── Labor Section ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...secLbl, margin: 0 }}>Labor</p>
            <button type="button" onClick={addLabor} style={addRowBtn}>+ Add Worker</button>
          </div>
          {formLabor.map((l, idx) => (
            <div key={l.id} style={{ background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
              {formLabor.length > 1 && (
                <button type="button" onClick={() => removeLabor(l.id)} style={removeRowBtn} title="Remove">&times;</button>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={lbl}>Worker Name</label>
                  <input value={l.worker} onChange={(e) => updateLabor(l.id, 'worker', e.target.value)} placeholder="Name" style={inpSm} />
                </div>
                <div>
                  <label style={lbl}>Trade</label>
                  <select value={l.trade} onChange={(e) => updateLabor(l.id, 'trade', e.target.value)} style={inpSm}>
                    {TRADES.map((t) => <option key={t} value={t} style={{ background: '#0D1D2E' }}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>Reg Hours</label>
                  <input type="number" step="0.25" min="0" value={l.regHours || ''} onChange={(e) => updateLabor(l.id, 'regHours', parseFloat(e.target.value) || 0)} placeholder="0" style={inpSm} />
                </div>
                <div>
                  <label style={lbl}>OT Hours</label>
                  <input type="number" step="0.25" min="0" value={l.otHours || ''} onChange={(e) => updateLabor(l.id, 'otHours', parseFloat(e.target.value) || 0)} placeholder="0" style={inpSm} />
                </div>
                <div>
                  <label style={lbl}>Rate ($/hr)</label>
                  <input type="number" step="0.01" min="0" value={l.rate || ''} onChange={(e) => updateLabor(l.id, 'rate', parseFloat(e.target.value) || 0)} placeholder="0.00" style={inpSm} />
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>
                  Line total: {formatUSD((l.regHours * l.rate) + (l.otHours * l.rate * 1.5))}
                </span>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', padding: '4px 0 8px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>Labor Total: {formatUSD(calcLaborTotal(formLabor))}</span>
          </div>
        </div>

        {/* ── Materials Section ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...secLbl, margin: 0 }}>Materials</p>
            <button type="button" onClick={addMaterial} style={addRowBtn}>+ Add Material</button>
          </div>
          {formMaterials.map((m) => (
            <div key={m.id} style={{ background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
              {formMaterials.length > 1 && (
                <button type="button" onClick={() => removeMaterial(m.id)} style={removeRowBtn} title="Remove">&times;</button>
              )}
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Description</label>
                <input value={m.description} onChange={(e) => updateMaterial(m.id, 'description', e.target.value)} placeholder="Material description" style={inpSm} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>Quantity</label>
                  <input type="number" step="0.01" min="0" value={m.qty || ''} onChange={(e) => updateMaterial(m.id, 'qty', parseFloat(e.target.value) || 0)} placeholder="0" style={inpSm} />
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={m.unit} onChange={(e) => updateMaterial(m.id, 'unit', e.target.value)} style={inpSm}>
                    {UNITS.map((u) => <option key={u} value={u} style={{ background: '#0D1D2E' }}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Unit Cost</label>
                  <input type="number" step="0.01" min="0" value={m.unitCost || ''} onChange={(e) => updateMaterial(m.id, 'unitCost', parseFloat(e.target.value) || 0)} placeholder="0.00" style={inpSm} />
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Line total: {formatUSD(m.qty * m.unitCost)}</span>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', padding: '4px 0 8px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>Materials Total: {formatUSD(calcMaterialTotal(formMaterials))}</span>
          </div>
        </div>

        {/* ── Equipment Section ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...secLbl, margin: 0 }}>Equipment</p>
            <button type="button" onClick={addEquipment} style={addRowBtn}>+ Add Equipment</button>
          </div>
          {formEquipment.map((eq) => (
            <div key={eq.id} style={{ background: '#07101C', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
              {formEquipment.length > 1 && (
                <button type="button" onClick={() => removeEquipment(eq.id)} style={removeRowBtn} title="Remove">&times;</button>
              )}
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Description</label>
                <input value={eq.description} onChange={(e) => updateEquipment(eq.id, 'description', e.target.value)} placeholder="Equipment description" style={inpSm} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>Hours</label>
                  <input type="number" step="0.25" min="0" value={eq.hours || ''} onChange={(e) => updateEquipment(eq.id, 'hours', parseFloat(e.target.value) || 0)} placeholder="0" style={inpSm} />
                </div>
                <div>
                  <label style={lbl}>Rate ($/hr)</label>
                  <input type="number" step="0.01" min="0" value={eq.rate || ''} onChange={(e) => updateEquipment(eq.id, 'rate', parseFloat(e.target.value) || 0)} placeholder="0.00" style={inpSm} />
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Line total: {formatUSD(eq.hours * eq.rate)}</span>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', padding: '4px 0 8px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>Equipment Total: {formatUSD(calcEquipmentTotal(formEquipment))}</span>
          </div>
        </div>

        {/* ── Markup, Tax & Totals ── */}
        <div style={{ ...card, background: 'linear-gradient(135deg, #0D1D2E 0%, #142A40 100%)' }}>
          <p style={secLbl}>Totals & Markup</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Markup %</label>
              <input type="number" step="0.5" min="0" max="100" value={formMarkup || ''} onChange={(e) => setFormMarkup(parseFloat(e.target.value) || 0)} placeholder="15" style={inpSm} />
            </div>
            <div>
              <label style={lbl}>Tax %</label>
              <input type="number" step="0.01" min="0" max="100" value={formTax || ''} onChange={(e) => setFormTax(parseFloat(e.target.value) || 0)} placeholder="0" style={inpSm} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ color: DIM, fontSize: 14 }}>Labor</span>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatUSD(calcLaborTotal(formLabor))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
            <span style={{ color: DIM, fontSize: 14 }}>Materials</span>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatUSD(calcMaterialTotal(formMaterials))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
            <span style={{ color: DIM, fontSize: 14 }}>Equipment</span>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatUSD(calcEquipmentTotal(formEquipment))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>Subtotal</span>
            <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{formatUSD(formSubtotal)}</span>
          </div>
          {formMarkup > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ color: DIM, fontSize: 14 }}>Markup ({formMarkup}%)</span>
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatUSD(formMarkupAmt)}</span>
            </div>
          )}
          {formTax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ color: DIM, fontSize: 14 }}>Tax ({formTax}%)</span>
              <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>{formatUSD(formTaxAmt)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 6px', borderTop: `2px solid ${GOLD}`, marginTop: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>Grand Total</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{formatUSD(formGrandTotal)}</span>
          </div>
        </div>

        {/* ── Photos ── */}
        <div style={card}>
          <p style={secLbl}>Site Photos</p>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#07101C', border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: DIM, fontSize: 14 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
              <rect x={3} y={3} width={18} height={18} rx={2}/><circle cx={8.5} cy={8.5} r={1.5}/><path d="M21 15l-5-5L5 21"/>
            </svg>
            Capture or Upload Photos
            <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} style={{ display: 'none' }} />
          </label>
          {formPhotoPreview.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginTop: 10 }}>
              {formPhotoPreview.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={src} alt={`Photo ${i + 1}`} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: RED, border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div style={card}>
          <p style={secLbl}>Additional Notes</p>
          <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Any additional context, site conditions, or justification..." rows={3} style={inp} />
        </div>

        {/* ── Signatures ── */}
        <div style={card}>
          <p style={secLbl}>Signatures</p>
          <SignaturePad label="Contractor Signature *" value={contractorSig} onChange={setContractorSig} />
          <SignaturePad label="Owner / GC Rep Signature" value={ownerSig} onChange={setOwnerSig} />
        </div>

        {/* ── Submit Buttons ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
          <button type="button" onClick={() => setView('list')} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving...' : contractorSig ? (online ? 'Submit T&M Ticket' : 'Submit (Offline)') : (online ? 'Save as Draft' : 'Save Draft (Offline)')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Default export with Suspense wrapper
// ═══════════════════════════════════════════════════════════
export default function FieldTMTicketsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <TMTicketsPage />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared components & style constants
// ═══════════════════════════════════════════════════════════
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', flex: '1 0 auto', minWidth: 100 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline \u2014 changes will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const inpSm: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 8, padding: '9px 12px', color: '#F0F4FF', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };
const addRowBtn: React.CSSProperties = { background: 'rgba(212,160,23,.12)', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '5px 12px', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const removeRowBtn: React.CSSProperties = { position: 'absolute', top: 8, right: 8, background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, width: 24, height: 24, color: RED, fontSize: 18, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 };
const actionBtnStyle: React.CSSProperties = { width: '100%', border: 'none', borderRadius: 12, padding: '16px', fontSize: 16, fontWeight: 800, cursor: 'pointer' };

// Table styles
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 6px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 6px', fontSize: 13, color: TEXT };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
