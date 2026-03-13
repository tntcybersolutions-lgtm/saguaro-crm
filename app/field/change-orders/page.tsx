'use client';
/**
 * Saguaro Field — Change Orders
 * View, create, approve, and reject change orders from the field. Offline queue.
 * PCO → CO pipeline, Email from app, PDF export.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#A855F7';

const STATUS_COLORS: Record<string, string> = { pending: AMBER, approved: GREEN, rejected: RED, draft: DIM };
const STATUS_LABELS: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', draft: 'Draft' };

const PCO_STATUS_COLORS: Record<string, string> = {
  identified: BLUE, pricing: AMBER, submitted: PURPLE, converted: GREEN, rejected: RED,
};
const PCO_STATUS_LABELS: Record<string, string> = {
  identified: 'Identified', pricing: 'Pricing', submitted: 'Submitted', converted: 'Converted', rejected: 'Rejected',
};

const REASONS = ['Owner Request', 'Field Condition', 'Design Change', 'Regulatory', 'Value Engineering'];

interface ChangeOrder {
  id: string;
  co_number?: number;
  title: string;
  description?: string;
  reason?: string;
  amount: number;
  status: string;
  cost_breakdown?: Array<{ item: string; amount: number }>;
  approval_history?: Array<{ action: string; by: string; date: string; reason?: string }>;
  created_at?: string;
}

interface PCO {
  id: string;
  pco_number?: number;
  title: string;
  description?: string;
  reason?: string;
  estimated_min: number;
  estimated_max: number;
  status: string;
  impacted_scope?: string;
  photos?: string[];
  pricing_history?: Array<{ amount: number; date: string; note: string }>;
  negotiation_notes?: string[];
  created_at?: string;
  converted_co_id?: string;
}

type View = 'list' | 'detail' | 'create' | 'pco_list' | 'pco_detail' | 'pco_create';

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ChangeOrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [cos, setCos] = useState<ChangeOrder[]>([]);
  const [pcos, setPcos] = useState<PCO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pcoLoading, setPcoLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<ChangeOrder | null>(null);
  const [selectedPCO, setSelectedPCO] = useState<PCO | null>(null);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState('all');
  const [pcoFilter, setPcoFilter] = useState('all');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<'cos' | 'pcos'>('cos');

  // Create CO form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newReason, setNewReason] = useState('Owner Request');
  const [newAmount, setNewAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Create PCO form
  const [pcoTitle, setPcoTitle] = useState('');
  const [pcoDesc, setPcoDesc] = useState('');
  const [pcoReason, setPcoReason] = useState('Field Condition');
  const [pcoMin, setPcoMin] = useState('');
  const [pcoMax, setPcoMax] = useState('');
  const [pcoScope, setPcoScope] = useState('');
  const [pcoPhotos, setPcoPhotos] = useState<File[]>([]);
  const [pcoSaving, setPcoSaving] = useState(false);

  // Approve / Reject
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentMsg, setEmailSentMsg] = useState('');
  const [emailContext, setEmailContext] = useState<'co' | 'pco'>('co');

  // PDF export
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); setPcoLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadCOs();
    loadPCOs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadCOs = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/change-orders`);
      const d = await r.json();
      setCos(d.change_orders || d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const loadPCOs = async () => {
    setPcoLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/potential-change-orders`);
      const d = await r.json();
      setPcos(d.potential_change_orders || d.items || d.data || []);
    } catch { /* offline */ }
    setPcoLoading(false);
  };

  const openDetail = (co: ChangeOrder) => {
    setSelected(co);
    setView('detail');
    setRejectReason('');
    setActionMsg('');
    setPdfUrl('');
    setEmailSentMsg('');
  };

  const openPCODetail = (pco: PCO) => {
    setSelectedPCO(pco);
    setView('pco_detail');
    setActionMsg('');
    setPdfUrl('');
    setEmailSentMsg('');
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/change-orders/${selected.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed');
      setActionMsg('Change order approved');
    } catch {
      await enqueue({
        url: `/api/change-orders/${selected.id}/approve`,
        method: 'PUT',
        body: JSON.stringify({}),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg('Approval queued — will sync when online');
    }
    // Optimistic update
    const updated = { ...selected, status: 'approved', approval_history: [...(selected.approval_history || []), { action: 'approved', by: 'You (field)', date: new Date().toISOString() }] };
    setSelected(updated);
    setCos((prev) => prev.map((c) => c.id === selected.id ? updated : c));
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/change-orders/${selected.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setActionMsg('Change order rejected');
    } catch {
      await enqueue({
        url: `/api/change-orders/${selected.id}/reject`,
        method: 'PUT',
        body: JSON.stringify({ reason: rejectReason.trim() }),
        contentType: 'application/json',
        isFormData: false,
      });
      setActionMsg('Rejection queued — will sync when online');
    }
    const updated = { ...selected, status: 'rejected', approval_history: [...(selected.approval_history || []), { action: 'rejected', by: 'You (field)', date: new Date().toISOString(), reason: rejectReason.trim() }] };
    setSelected(updated);
    setCos((prev) => prev.map((c) => c.id === selected.id ? updated : c));
    setRejectReason('');
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAmount) return;
    setSaving(true);

    const payload = {
      projectId,
      title: newTitle.trim(),
      description: newDesc.trim(),
      reason: newReason,
      amount: parseFloat(newAmount),
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/change-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const newCO: ChangeOrder = {
        id: data.id || `temp-${Date.now()}`,
        co_number: (cos.length + 1),
        title: newTitle.trim(),
        description: newDesc.trim(),
        reason: newReason,
        amount: parseFloat(newAmount),
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
    } catch {
      await enqueue({
        url: '/api/change-orders',
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newCO: ChangeOrder = {
        id: `queued-${Date.now()}`,
        co_number: (cos.length + 1),
        title: newTitle.trim(),
        description: newDesc.trim(),
        reason: newReason,
        amount: parseFloat(newAmount),
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
    }

    setNewTitle('');
    setNewDesc('');
    setNewReason('Owner Request');
    setNewAmount('');
    setSaving(false);
    setView('list');
  };

  // ─── PCO CREATE ──────────────────────────────────────────────
  const handleCreatePCO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcoTitle.trim() || !pcoMin || !pcoMax) return;
    setPcoSaving(true);

    const payload: Record<string, unknown> = {
      projectId,
      title: pcoTitle.trim(),
      description: pcoDesc.trim(),
      reason: pcoReason,
      estimated_min: parseFloat(pcoMin),
      estimated_max: parseFloat(pcoMax),
      impacted_scope: pcoScope.trim(),
      status: 'identified',
    };

    // If photos selected, use FormData
    if (pcoPhotos.length > 0) {
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v)));
      pcoPhotos.forEach((f) => fd.append('photos', f));

      try {
        if (!online) throw new Error('offline');
        const res = await fetch(`/api/projects/${projectId}/potential-change-orders`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json().catch(() => ({}));
        const newPCO: PCO = {
          id: data.id || `temp-${Date.now()}`,
          pco_number: (pcos.length + 1),
          title: pcoTitle.trim(),
          description: pcoDesc.trim(),
          reason: pcoReason,
          estimated_min: parseFloat(pcoMin),
          estimated_max: parseFloat(pcoMax),
          impacted_scope: pcoScope.trim(),
          status: 'identified',
          created_at: new Date().toISOString(),
          pricing_history: [],
          negotiation_notes: [],
        };
        setPcos((prev) => [newPCO, ...prev]);
      } catch {
        await enqueue({
          url: `/api/projects/${projectId}/potential-change-orders`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        const newPCO: PCO = {
          id: `queued-${Date.now()}`,
          pco_number: (pcos.length + 1),
          title: pcoTitle.trim(),
          description: pcoDesc.trim(),
          reason: pcoReason,
          estimated_min: parseFloat(pcoMin),
          estimated_max: parseFloat(pcoMax),
          impacted_scope: pcoScope.trim(),
          status: 'identified',
          created_at: new Date().toISOString(),
          pricing_history: [],
          negotiation_notes: [],
        };
        setPcos((prev) => [newPCO, ...prev]);
      }
    } else {
      try {
        if (!online) throw new Error('offline');
        const res = await fetch(`/api/projects/${projectId}/potential-change-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json().catch(() => ({}));
        const newPCO: PCO = {
          id: data.id || `temp-${Date.now()}`,
          pco_number: (pcos.length + 1),
          title: pcoTitle.trim(),
          description: pcoDesc.trim(),
          reason: pcoReason,
          estimated_min: parseFloat(pcoMin),
          estimated_max: parseFloat(pcoMax),
          impacted_scope: pcoScope.trim(),
          status: 'identified',
          created_at: new Date().toISOString(),
          pricing_history: [],
          negotiation_notes: [],
        };
        setPcos((prev) => [newPCO, ...prev]);
      } catch {
        await enqueue({
          url: `/api/projects/${projectId}/potential-change-orders`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        const newPCO: PCO = {
          id: `queued-${Date.now()}`,
          pco_number: (pcos.length + 1),
          title: pcoTitle.trim(),
          description: pcoDesc.trim(),
          reason: pcoReason,
          estimated_min: parseFloat(pcoMin),
          estimated_max: parseFloat(pcoMax),
          impacted_scope: pcoScope.trim(),
          status: 'identified',
          created_at: new Date().toISOString(),
          pricing_history: [],
          negotiation_notes: [],
        };
        setPcos((prev) => [newPCO, ...prev]);
      }
    }

    setPcoTitle('');
    setPcoDesc('');
    setPcoReason('Field Condition');
    setPcoMin('');
    setPcoMax('');
    setPcoScope('');
    setPcoPhotos([]);
    setPcoSaving(false);
    setView('pco_list');
    setActiveTab('pcos');
  };

  // ─── CONVERT PCO → CO ───────────────────────────────────────
  const handleConvertPCO = async () => {
    if (!selectedPCO) return;
    setActionLoading(true);
    const midpoint = (selectedPCO.estimated_min + selectedPCO.estimated_max) / 2;

    const payload = {
      projectId,
      title: selectedPCO.title,
      description: selectedPCO.description || '',
      reason: selectedPCO.reason || 'Field Condition',
      amount: midpoint,
      source_pco_id: selectedPCO.id,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/change-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const newCO: ChangeOrder = {
        id: data.id || `temp-${Date.now()}`,
        co_number: (cos.length + 1),
        title: selectedPCO.title,
        description: selectedPCO.description,
        reason: selectedPCO.reason,
        amount: midpoint,
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
      setActionMsg('PCO converted to Change Order successfully');
    } catch {
      await enqueue({
        url: '/api/change-orders',
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newCO: ChangeOrder = {
        id: `queued-${Date.now()}`,
        co_number: (cos.length + 1),
        title: selectedPCO.title,
        description: selectedPCO.description,
        reason: selectedPCO.reason,
        amount: midpoint,
        status: 'pending',
        created_at: new Date().toISOString(),
        approval_history: [],
      };
      setCos((prev) => [newCO, ...prev]);
      setActionMsg('Conversion queued — will sync when online');
    }

    // Update PCO status to converted
    const updatedPCO = { ...selectedPCO, status: 'converted' };
    setSelectedPCO(updatedPCO);
    setPcos((prev) => prev.map((p) => p.id === selectedPCO.id ? updatedPCO : p));

    // Also try to update PCO status on server
    try {
      await fetch(`/api/projects/${projectId}/potential-change-orders/${selectedPCO.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'converted' }),
      });
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/potential-change-orders/${selectedPCO.id}`,
        method: 'PUT',
        body: JSON.stringify({ status: 'converted' }),
        contentType: 'application/json',
        isFormData: false,
      });
    }

    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 3500);
  };

  // ─── EMAIL ───────────────────────────────────────────────────
  const openEmailModal = (context: 'co' | 'pco') => {
    setEmailContext(context);
    setEmailSentMsg('');
    if (context === 'co' && selected) {
      setEmailSubject(`Change Order CO-${selected.co_number || ''}: ${selected.title}`);
      setEmailBody(
        `Please find attached Change Order details:\n\n` +
        `Title: ${selected.title}\n` +
        `CO Number: CO-${selected.co_number || 'N/A'}\n` +
        `Status: ${STATUS_LABELS[selected.status] || selected.status}\n` +
        `Amount: ${formatUSD(selected.amount)}\n` +
        `Reason: ${selected.reason || 'N/A'}\n` +
        (selected.description ? `\nDescription:\n${selected.description}\n` : '') +
        `\nPlease review and respond at your earliest convenience.`
      );
    } else if (context === 'pco' && selectedPCO) {
      setEmailSubject(`Pricing Request - PCO-${selectedPCO.pco_number || ''}: ${selectedPCO.title}`);
      setEmailBody(
        `Please provide pricing for the following Potential Change Order:\n\n` +
        `Title: ${selectedPCO.title}\n` +
        `PCO Number: PCO-${selectedPCO.pco_number || 'N/A'}\n` +
        `Estimated Range: ${formatUSD(selectedPCO.estimated_min)} - ${formatUSD(selectedPCO.estimated_max)}\n` +
        `Reason: ${selectedPCO.reason || 'N/A'}\n` +
        (selectedPCO.impacted_scope ? `Impacted Scope: ${selectedPCO.impacted_scope}\n` : '') +
        (selectedPCO.description ? `\nDescription:\n${selectedPCO.description}\n` : '') +
        `\nPlease return pricing at your earliest convenience.`
      );
    }
    setEmailTo('');
    setEmailCc('');
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim()) return;
    setEmailSending(true);

    const payload = {
      type: 'email_record',
      to: emailTo.trim(),
      cc: emailCc.trim() || undefined,
      subject: emailSubject.trim(),
      body: emailBody.trim(),
      related_type: emailContext === 'co' ? 'change_order' : 'potential_change_order',
      related_id: emailContext === 'co' ? selected?.id : selectedPCO?.id,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/correspondence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      setEmailSentMsg(`Email sent at ${formatDateTime(new Date().toISOString())}`);
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/correspondence`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      setEmailSentMsg('Email queued — will send when online');
    }

    setEmailSending(false);
    setShowEmailModal(false);
    setTimeout(() => setEmailSentMsg(''), 5000);
  };

  // ─── PDF EXPORT ──────────────────────────────────────────────
  const handleExportPdf = async (type: 'co' | 'pco') => {
    setPdfLoading(true);
    setPdfUrl('');
    const id = type === 'co' ? selected?.id : selectedPCO?.id;
    const endpoint = type === 'co'
      ? `/api/projects/${projectId}/change-orders/${id}/export-pdf`
      : `/api/projects/${projectId}/potential-change-orders/${id}/export-pdf`;

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPdfUrl(data.url || data.download_url || '');
    } catch {
      setActionMsg('PDF export failed — try again');
      setTimeout(() => setActionMsg(''), 3500);
    }
    setPdfLoading(false);
  };

  const filtered = filter === 'all' ? cos : cos.filter((c) => c.status === filter);
  const totalValue = cos.reduce((sum, c) => sum + (c.amount || 0), 0);
  const approvedValue = cos.filter((c) => c.status === 'approved').reduce((sum, c) => sum + (c.amount || 0), 0);
  const pendingCount = cos.filter((c) => c.status === 'pending').length;

  const filteredPCOs = pcoFilter === 'all' ? pcos : pcos.filter((p) => p.status === pcoFilter);
  const pcoTotalEstimated = pcos.reduce((sum, p) => sum + ((p.estimated_min + p.estimated_max) / 2), 0);
  const pcoPendingCount = pcos.filter((p) => !['converted', 'rejected'].includes(p.status)).length;

  // ─── EMAIL MODAL ─────────────────────────────────────────────
  const EmailModal = () => {
    if (!showEmailModal) return null;
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: '#0A1929', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: GOLD }}>
              {emailContext === 'co' ? 'Email to Owner' : 'Email for Pricing'}
            </h2>
            <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', padding: 4 }}>x</button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>To *</label>
            <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="recipient@example.com" style={inp} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>CC</label>
            <input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="cc@example.com" style={inp} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Subject</label>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Body</label>
            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={8} style={inp} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowEmailModal(false)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px', color: DIM, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSendEmail} disabled={emailSending || !emailTo.trim()} style={{
              flex: 2, background: emailSending || !emailTo.trim() ? '#1E3A5F' : BLUE, border: 'none', borderRadius: 12,
              padding: '14px', color: emailSending || !emailTo.trim() ? DIM : '#fff', fontSize: 14, fontWeight: 800,
              cursor: emailSending || !emailTo.trim() ? 'not-allowed' : 'pointer',
            }}>
              {emailSending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── TAB BAR (shared between list views) ─────────────────────
  const TabBar = () => (
    <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: `2px solid ${BORDER}` }}>
      <button onClick={() => { setActiveTab('cos'); setView('list'); }} style={{
        flex: 1, background: 'none', border: 'none', borderBottom: activeTab === 'cos' ? `2px solid ${GOLD}` : '2px solid transparent',
        padding: '10px 0', color: activeTab === 'cos' ? GOLD : DIM, fontSize: 14, fontWeight: activeTab === 'cos' ? 800 : 500,
        cursor: 'pointer', marginBottom: -2,
      }}>
        Change Orders ({cos.length})
      </button>
      <button onClick={() => { setActiveTab('pcos'); setView('pco_list'); }} style={{
        flex: 1, background: 'none', border: 'none', borderBottom: activeTab === 'pcos' ? `2px solid ${PURPLE}` : '2px solid transparent',
        padding: '10px 0', color: activeTab === 'pcos' ? PURPLE : DIM, fontSize: 14, fontWeight: activeTab === 'pcos' ? 800 : 500,
        cursor: 'pointer', marginBottom: -2,
      }}>
        PCOs ({pcos.length})
      </button>
    </div>
  );

  // ─── LIST VIEW ────────────────────────────────────────────────
  if (view === 'list' || view === 'pco_list') {
    const isPCOTab = view === 'pco_list' || activeTab === 'pcos';

    if (isPCOTab && view !== 'pco_list') {
      setView('pco_list');
    }
    if (!isPCOTab && view !== 'list') {
      setView('list');
    }

    return (
      <div style={{ padding: '18px 16px' }}>
        <EmailModal />

        <button onClick={() => router.back()} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Change Orders</h1>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>{projectName}</p>
          </div>
          <button onClick={() => isPCOTab ? setView('pco_create') : setView('create')} style={{
            background: isPCOTab ? PURPLE : GOLD, border: 'none', borderRadius: 10, padding: '10px 16px',
            color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>
            {isPCOTab ? '+ New PCO' : '+ New CO'}
          </button>
        </div>

        {!online && <OfflineBanner />}

        <TabBar />

        {/* ─── CO TAB ──────── */}
        {!isPCOTab && (
          <>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
              <StatCard label="Total Value" value={formatUSD(totalValue)} color={GOLD} />
              <StatCard label="Approved" value={formatUSD(approvedValue)} color={GREEN} />
              <StatCard label="Pending" value={String(pendingCount)} color={AMBER} />
              <StatCard label="Total COs" value={String(cos.length)} color={BLUE} />
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
              {['all', 'pending', 'approved', 'rejected', 'draft'].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ flexShrink: 0, background: filter === f ? 'rgba(212,160,23,.2)' : 'transparent', border: `1px solid ${filter === f ? GOLD : BORDER}`, borderRadius: 20, padding: '5px 12px', color: filter === f ? GOLD : DIM, fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {f === 'all' ? 'All' : STATUS_LABELS[f] || f}
                </button>
              ))}
            </div>

            {/* List */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading change orders...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
                <div style={{ marginBottom: 8, color: GOLD, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><line x1={9} y1={15} x2={15} y2={15}/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 14 }}>{filter === 'all' ? 'No change orders yet. Tap "+ New CO" to create one.' : 'No change orders match this filter.'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map((co) => {
                  const sc = STATUS_COLORS[co.status] || DIM;
                  return (
                    <button
                      key={co.id}
                      onClick={() => openDetail(co)}
                      style={{
                        background: RAISED, border: `1px solid ${BORDER}`,
                        borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {co.co_number != null && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '2px 8px', borderRadius: 6 }}>
                                CO-{co.co_number}
                              </span>
                            )}
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                              background: `rgba(${hexRgb(sc)},.12)`,
                              color: sc,
                            }}>
                              {STATUS_LABELS[co.status] || co.status}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{co.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: co.amount >= 0 ? GREEN : RED }}>{formatUSD(co.amount)}</span>
                            {co.reason && <span style={{ fontSize: 11, color: DIM }}>{co.reason}</span>}
                          </div>
                        </div>
                        <span style={{ color: DIM, fontSize: 18, flexShrink: 0, marginTop: 4 }}>›</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── PCO TAB ──────── */}
        {isPCOTab && (
          <>
            {/* PCO Stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
              <StatCard label="Total PCOs" value={String(pcos.length)} color={PURPLE} />
              <StatCard label="Est. Value" value={formatUSD(pcoTotalEstimated)} color={GOLD} />
              <StatCard label="Pending" value={String(pcoPendingCount)} color={AMBER} />
            </div>

            {/* PCO Filter chips */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
              {['all', 'identified', 'pricing', 'submitted', 'converted', 'rejected'].map((f) => (
                <button key={f} onClick={() => setPcoFilter(f)}
                  style={{ flexShrink: 0, background: pcoFilter === f ? 'rgba(168,85,247,.2)' : 'transparent', border: `1px solid ${pcoFilter === f ? PURPLE : BORDER}`, borderRadius: 20, padding: '5px 12px', color: pcoFilter === f ? PURPLE : DIM, fontSize: 12, fontWeight: pcoFilter === f ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {f === 'all' ? 'All' : PCO_STATUS_LABELS[f] || f}
                </button>
              ))}
            </div>

            {/* PCO List */}
            {pcoLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading PCOs...</div>
            ) : filteredPCOs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
                <div style={{ marginBottom: 8, color: PURPLE, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                    <circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 14 }}>{pcoFilter === 'all' ? 'No potential change orders yet. Tap "+ New PCO" to create one.' : 'No PCOs match this filter.'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredPCOs.map((pco) => {
                  const sc = PCO_STATUS_COLORS[pco.status] || DIM;
                  const midEst = (pco.estimated_min + pco.estimated_max) / 2;
                  return (
                    <button
                      key={pco.id}
                      onClick={() => openPCODetail(pco)}
                      style={{
                        background: RAISED, border: `1px solid ${BORDER}`,
                        borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {pco.pco_number != null && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: PURPLE, background: 'rgba(168,85,247,.12)', padding: '2px 8px', borderRadius: 6 }}>
                                PCO-{pco.pco_number}
                              </span>
                            )}
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                              background: `rgba(${hexRgb(sc)},.12)`,
                              color: sc,
                            }}>
                              {PCO_STATUS_LABELS[pco.status] || pco.status}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{pco.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{formatUSD(pco.estimated_min)} - {formatUSD(pco.estimated_max)}</span>
                            {pco.reason && <span style={{ fontSize: 11, color: DIM }}>{pco.reason}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Mid: {formatUSD(midEst)}</div>
                        </div>
                        <span style={{ color: DIM, fontSize: 18, flexShrink: 0, marginTop: 4 }}>›</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── CO DETAIL VIEW ──────────────────────────────────────────
  if (view === 'detail' && selected) {
    const sc = STATUS_COLORS[selected.status] || DIM;
    return (
      <div style={{ padding: '18px 16px' }}>
        <EmailModal />

        <button onClick={() => { setView('list'); setActiveTab('cos'); setActionMsg(''); setPdfUrl(''); setEmailSentMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {selected.co_number != null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '3px 10px', borderRadius: 6 }}>
              CO-{selected.co_number}
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(sc)},.12)`,
            color: sc,
          }}>
            {STATUS_LABELS[selected.status] || selected.status}
          </span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selected.title}</h1>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>
          {selected.reason ? `Reason: ${selected.reason}` : ''}
          {selected.created_at ? ` · Created ${formatDate(selected.created_at)}` : ''}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 800, color: selected.amount >= 0 ? GREEN : RED }}>{formatUSD(selected.amount)}</p>

        {/* Action buttons row: Email + PDF */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => openEmailModal('co')} style={{
            flex: 1, background: 'rgba(59,130,246,.1)', border: `1px solid rgba(59,130,246,.3)`, borderRadius: 10,
            padding: '10px 12px', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Email to Owner
          </button>
          <button onClick={() => handleExportPdf('co')} disabled={pdfLoading} style={{
            flex: 1, background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10,
            padding: '10px 12px', color: GOLD, fontSize: 13, fontWeight: 700,
            cursor: pdfLoading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><polyline points="9 15 12 18 15 15"/>
            </svg>
            {pdfLoading ? 'Generating...' : 'Export PDF'}
          </button>
        </div>

        {/* PDF download link */}
        {pdfUrl && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>PDF ready</span>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}>Download PDF</a>
          </div>
        )}

        {/* Email sent confirmation */}
        {emailSentMsg && (
          <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: BLUE, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{emailSentMsg}
          </div>
        )}

        {actionMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {!online && <OfflineBanner />}

        {/* Description */}
        {selected.description && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Description</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          </div>
        )}

        {/* Cost Breakdown */}
        {selected.cost_breakdown && selected.cost_breakdown.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Cost Breakdown</p>
            {selected.cost_breakdown.map((line, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: 14, color: TEXT }}>{line.item}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{formatUSD(line.amount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: `1px solid ${GOLD}`, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>{formatUSD(selected.amount)}</span>
            </div>
          </div>
        )}

        {/* Approval History */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={secLbl}>Approval History ({selected.approval_history?.length || 0})</p>
          {(!selected.approval_history || selected.approval_history.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No approval actions yet</p>
          ) : (
            selected.approval_history.map((entry, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: entry.action === 'approved' ? GREEN : entry.action === 'rejected' ? RED : GOLD }}>{entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(entry.date)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: TEXT }}>by {entry.by}</p>
                {entry.reason && <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM, fontStyle: 'italic' }}>Reason: {entry.reason}</p>}
              </div>
            ))
          )}
        </div>

        {/* Approval Actions */}
        {selected.status === 'pending' && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Actions</p>
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              style={{
                width: '100%', background: actionLoading ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 12,
                padding: '16px', color: actionLoading ? DIM : '#000', fontSize: 16, fontWeight: 800,
                cursor: actionLoading ? 'wait' : 'pointer', marginBottom: 10,
              }}
            >
              {actionLoading ? 'Processing...' : 'Approve Change Order'}
            </button>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejecting this change order..."
                rows={3}
                style={inp}
              />
            </div>
            <button
              onClick={handleReject}
              disabled={actionLoading || !rejectReason.trim()}
              style={{
                width: '100%', background: actionLoading || !rejectReason.trim() ? '#1E3A5F' : RED, border: 'none', borderRadius: 12,
                padding: '16px', color: actionLoading || !rejectReason.trim() ? DIM : '#fff', fontSize: 16, fontWeight: 800,
                cursor: actionLoading || !rejectReason.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Reject Change Order
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── PCO DETAIL VIEW ─────────────────────────────────────────
  if (view === 'pco_detail' && selectedPCO) {
    const sc = PCO_STATUS_COLORS[selectedPCO.status] || DIM;
    const midEst = (selectedPCO.estimated_min + selectedPCO.estimated_max) / 2;
    return (
      <div style={{ padding: '18px 16px' }}>
        <EmailModal />

        <button onClick={() => { setView('pco_list'); setActiveTab('pcos'); setActionMsg(''); setPdfUrl(''); setEmailSentMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {selectedPCO.pco_number != null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: PURPLE, background: 'rgba(168,85,247,.12)', padding: '3px 10px', borderRadius: 6 }}>
              PCO-{selectedPCO.pco_number}
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(sc)},.12)`,
            color: sc,
          }}>
            {PCO_STATUS_LABELS[selectedPCO.status] || selectedPCO.status}
          </span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedPCO.title}</h1>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>
          {selectedPCO.reason ? `Reason: ${selectedPCO.reason}` : ''}
          {selectedPCO.created_at ? ` · Created ${formatDate(selectedPCO.created_at)}` : ''}
        </p>
        <div style={{ margin: '0 0 6px' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{formatUSD(selectedPCO.estimated_min)} - {formatUSD(selectedPCO.estimated_max)}</span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Midpoint: {formatUSD(midEst)}</p>

        {/* Action buttons row: Email + PDF + Convert */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => openEmailModal('pco')} style={{
            flex: 1, minWidth: 120, background: 'rgba(59,130,246,.1)', border: `1px solid rgba(59,130,246,.3)`, borderRadius: 10,
            padding: '10px 12px', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Email for Pricing
          </button>
          <button onClick={() => handleExportPdf('pco')} disabled={pdfLoading} style={{
            flex: 1, minWidth: 120, background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10,
            padding: '10px 12px', color: GOLD, fontSize: 13, fontWeight: 700,
            cursor: pdfLoading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><polyline points="9 15 12 18 15 15"/>
            </svg>
            {pdfLoading ? 'Generating...' : 'Export PDF'}
          </button>
        </div>

        {/* Convert to CO button */}
        {selectedPCO.status !== 'converted' && selectedPCO.status !== 'rejected' && (
          <button onClick={handleConvertPCO} disabled={actionLoading} style={{
            width: '100%', background: actionLoading ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 12,
            padding: '16px', color: actionLoading ? DIM : '#000', fontSize: 16, fontWeight: 800,
            cursor: actionLoading ? 'wait' : 'pointer', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
            {actionLoading ? 'Converting...' : 'Convert to Change Order'}
          </button>
        )}

        {selectedPCO.status === 'converted' && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>
            This PCO has been converted to a formal Change Order
          </div>
        )}

        {/* PDF download link */}
        {pdfUrl && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>PDF ready</span>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}>Download PDF</a>
          </div>
        )}

        {/* Email sent confirmation */}
        {emailSentMsg && (
          <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: BLUE, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{emailSentMsg}
          </div>
        )}

        {actionMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {!online && <OfflineBanner />}

        {/* Description */}
        {selectedPCO.description && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Description</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedPCO.description}</p>
          </div>
        )}

        {/* Impacted Scope */}
        {selectedPCO.impacted_scope && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Impacted Scope</p>
            <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedPCO.impacted_scope}</p>
          </div>
        )}

        {/* Photos */}
        {selectedPCO.photos && selectedPCO.photos.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Photos ({selectedPCO.photos.length})</p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {selectedPCO.photos.map((url, i) => (
                <img key={i} src={url} alt={`PCO photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
              ))}
            </div>
          </div>
        )}

        {/* Pricing History */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={secLbl}>Pricing History ({selectedPCO.pricing_history?.length || 0})</p>
          {(!selectedPCO.pricing_history || selectedPCO.pricing_history.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No pricing entries yet</p>
          ) : (
            selectedPCO.pricing_history.map((entry, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{formatUSD(entry.amount)}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(entry.date)}</span>
                </div>
                {entry.note && <p style={{ margin: 0, fontSize: 13, color: TEXT }}>{entry.note}</p>}
              </div>
            ))
          )}
        </div>

        {/* Negotiation Notes */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={secLbl}>Negotiation Notes ({selectedPCO.negotiation_notes?.length || 0})</p>
          {(!selectedPCO.negotiation_notes || selectedPCO.negotiation_notes.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No negotiation notes yet</p>
          ) : (
            selectedPCO.negotiation_notes.map((note, i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{note}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ─── PCO CREATE VIEW ─────────────────────────────────────────
  if (view === 'pco_create') {
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => { setView('pco_list'); setActiveTab('pcos'); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: PURPLE }}>New Potential Change Order</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Identify a potential change for pricing and review</p>

        {!online && <OfflineBanner />}

        <form onSubmit={handleCreatePCO}>
          <div style={card}>
            <p style={secLbl}>PCO Details</p>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Title *</label>
              <input value={pcoTitle} onChange={(e) => setPcoTitle(e.target.value)} placeholder="Brief PCO title" style={inp} required />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Description</label>
              <textarea value={pcoDesc} onChange={(e) => setPcoDesc(e.target.value)} placeholder="Describe the potential change, its impact, and justification..." rows={4} style={inp} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Reason *</label>
                <select value={pcoReason} onChange={(e) => setPcoReason(e.target.value)} style={inp}>
                  {REASONS.map((r) => <option key={r} value={r} style={{ background: '#0D1D2E' }}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Impacted Scope</label>
                <input value={pcoScope} onChange={(e) => setPcoScope(e.target.value)} placeholder="e.g., Electrical, Plumbing" style={inp} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Estimated Min (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={pcoMin}
                  onChange={(e) => setPcoMin(e.target.value)}
                  placeholder="0.00"
                  style={inp}
                  required
                />
              </div>
              <div>
                <label style={lbl}>Estimated Max (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={pcoMax}
                  onChange={(e) => setPcoMax(e.target.value)}
                  placeholder="0.00"
                  style={inp}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Photos (optional)</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setPcoPhotos(Array.from(e.target.files || []))}
                style={{ ...inp, padding: '8px 14px', fontSize: 13 }}
              />
              {pcoPhotos.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: DIM }}>{pcoPhotos.length} photo(s) selected</p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { setView('pco_list'); setActiveTab('pcos'); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={pcoSaving} style={{ flex: 2, background: pcoSaving ? '#1E3A5F' : PURPLE, border: 'none', borderRadius: 12, padding: '16px', color: pcoSaving ? DIM : '#fff', fontSize: 15, fontWeight: 800, cursor: pcoSaving ? 'wait' : 'pointer' }}>
              {pcoSaving ? 'Saving...' : online ? 'Submit PCO' : 'Submit (Offline — will sync)'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─── CREATE CO VIEW ──────────────────────────────────────────
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => setView('list')} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: GOLD }}>New Change Order</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Submit a change order for this project</p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleCreate}>
        <div style={card}>
          <p style={secLbl}>Change Order Details</p>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Title *</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Brief CO title" style={inp} required />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Description</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe the change order scope, impact, and justification..." rows={4} style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Reason *</label>
              <select value={newReason} onChange={(e) => setNewReason(e.target.value)} style={inp}>
                {REASONS.map((r) => <option key={r} value={r} style={{ background: '#0D1D2E' }}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount (USD) *</label>
              <input
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                style={inp}
                required
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setView('list')} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving...' : online ? 'Submit Change Order' : 'Submit (Offline — will sync)'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function FieldChangeOrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <ChangeOrdersPage />
    </Suspense>
  );
}

// Shared helpers
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', flex: '1 0 auto', minWidth: 100 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
