'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface Selection {
  id: string;
  category: string;
  item: string;
  manufacturer: string;
  model: string;
  cost: number;
  status: string;
  selected_by: string;
  notes: string;
  owner_approved: boolean;
  project_id: string;
}

const CATEGORIES = ['Flooring', 'Countertops', 'Fixtures', 'Hardware', 'Paint', 'Tile', 'Appliances'];

const STATUS_BADGE: Record<string, 'amber' | 'blue' | 'gold' | 'green' | 'muted'> = {
  pending: 'amber',
  selected: 'blue',
  ordered: 'gold',
  installed: 'green',
};

const EMPTY_FORM = { category: 'Flooring', item: '', manufacturer: '', model: '', cost: 0, notes: '' };

export default function SelectionsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchSelections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/selections`);
      const json = await res.json();
      setSelections(json.selections || []);
    } catch {
      setSelections([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSelections(); }, [fetchSelections]);

  const totalCost = selections.reduce((s, sel) => s + (sel.cost || 0), 0);
  const pending = selections.filter(s => s.status === 'pending').length;
  const ordered = selections.filter(s => s.status === 'ordered').length;
  const installed = selections.filter(s => s.status === 'installed').length;

  async function handleSave() {
    if (!form.item || !form.category) { setErrorMsg('Category and item are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const newSel: Selection = {
      id: `sel-${Date.now()}`,
      project_id: projectId,
      status: 'pending',
      selected_by: '',
      owner_approved: false,
      ...form,
    };
    try {
      const res = await fetch('/api/selections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...newSel }),
      });
      const json = await res.json();
      setSelections(prev => [...prev, json.selection || newSel]);
    } catch {
      setSelections(prev => [...prev, newSel]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Selection added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleApprove(id: string) {
    try {
      await fetch(`/api/selections/${id}/approve`, { method: 'PATCH' });
    } catch { /* demo */ }
    setSelections(prev => prev.map(s => s.id === id ? { ...s, owner_approved: true } : s));
    setSuccessMsg('Owner approval granted.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Selections"
          sub="Owner and design selections log"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ Add Selection'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="🎨" label="Total Selections" value={String(selections.length)} />
        <StatCard icon="⏳" label="Pending" value={String(pending)} />
        <StatCard icon="📦" label="Ordered" value={String(ordered)} />
        <StatCard icon="💰" label="Total Cost" value={`$${totalCost.toLocaleString()}`} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Selection</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Category *</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Item *</label>
                  <input value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} placeholder="e.g. Kitchen Faucet" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Manufacturer</label>
                  <input value={form.manufacturer} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Model</label>
                  <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Cost ($)</label>
                  <input type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Notes</label>
                  <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Selection'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Category', 'Item', 'Manufacturer', 'Model', 'Cost', 'Status', 'Selected By', 'Owner Approval']}
                rows={selections.map(s => [
                  <span key="c" style={{ color: T.gold, fontWeight: 600 }}>{s.category}</span>,
                  s.item,
                  <span key="m" style={{ color: T.muted }}>{s.manufacturer || '—'}</span>,
                  <span key="mod" style={{ color: T.muted }}>{s.model || '—'}</span>,
                  <span key="cost" style={{ fontWeight: 700 }}>${(s.cost || 0).toLocaleString()}</span>,
                  <Badge key="st" label={s.status} color={STATUS_BADGE[s.status] || 'muted'} />,
                  <span key="by" style={{ color: T.muted }}>{s.selected_by || '—'}</span>,
                  <div key="appr">
                    {s.owner_approved ? (
                      <Badge label="Approved" color="green" />
                    ) : (
                      <Btn size="sm" onClick={() => handleApprove(s.id)}>Approve</Btn>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
