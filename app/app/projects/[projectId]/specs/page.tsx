'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface Spec {
  id: string;
  division: string;
  section: string;
  title: string;
  status: string;
  last_updated: string;
  url: string | null;
  related_submittals: string[];
  project_id: string;
}

const STATUS_BADGE: Record<string, 'muted' | 'blue' | 'amber' | 'green'> = {
  draft: 'muted',
  issued: 'blue',
  revised: 'amber',
  approved: 'green',
};

const EMPTY_FORM = { division: '', section: '', title: '' };

export default function SpecsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/specs`);
      const json = await res.json();
      setSpecs(json.specs || []);
    } catch {
      setSpecs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSpecs(); }, [fetchSpecs]);

  const filtered = specs.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.section.includes(search) || s.division.includes(search)
  );

  const draftCount = specs.filter(s => s.status === 'draft').length;
  const issuedCount = specs.filter(s => s.status === 'issued').length;
  const approvedCount = specs.filter(s => s.status === 'approved').length;

  async function handleSave() {
    if (!form.section || !form.title) { setErrorMsg('Section number and title are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const today = new Date().toISOString().split('T')[0];
    const newSpec: Spec = {
      id: `s-${Date.now()}`,
      project_id: projectId,
      last_updated: today,
      status: 'draft',
      url: null,
      related_submittals: [],
      ...form,
    };
    try {
      const res = await fetch('/api/specs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...newSpec }),
      });
      const json = await res.json();
      setSpecs(prev => [...prev, json.spec || newSpec].sort((a, b) => a.section.localeCompare(b.section)));
    } catch {
      setSpecs(prev => [...prev, newSpec]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Spec section added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleUploadSpec(specId: string, file: File) {
    setUploading(specId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('specId', specId);
      await fetch(`/api/specs/${specId}/upload`, { method: 'POST', body: fd });
      setSuccessMsg('Spec file uploaded.');
    } catch {
      setSuccessMsg('Spec file received (demo mode).');
    }
    setUploading(null);
    setTimeout(() => setSuccessMsg(''), 4000);
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
          title="Specifications"
          sub="Project specifications by CSI division"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ Add Section'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📄" label="Total Sections" value={String(specs.length)} />
        <StatCard icon="📝" label="Draft" value={String(draftCount)} />
        <StatCard icon="📤" label="Issued" value={String(issuedCount)} />
        <StatCard icon="✅" label="Approved" value={String(approvedCount)} />
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
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Spec Section</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Division #</label>
                  <input value={form.division} onChange={e => setForm(p => ({ ...p, division: e.target.value }))} placeholder="e.g. 03" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Section # *</label>
                  <input value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} placeholder="e.g. 03 31 00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Title *</label>
                  <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Section'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '0 24px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search sections..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, width: 240, outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: T.muted }}>{filtered.length} section{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Section #', 'Title', 'Division', 'Status', 'Last Updated', 'Submittals', 'Actions']}
                rows={filtered.map(s => [
                  <span key="sec" style={{ color: T.gold, fontWeight: 700 }}>{s.section}</span>,
                  s.title,
                  <span key="div" style={{ color: T.muted }}>{s.division || '—'}</span>,
                  <Badge key="st" label={s.status} color={STATUS_BADGE[s.status] || 'muted'} />,
                  <span key="upd" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{s.last_updated || '—'}</span>,
                  <span key="sub" style={{ color: T.muted, fontSize: 12 }}>
                    {s.related_submittals && s.related_submittals.length > 0
                      ? s.related_submittals.join(', ')
                      : '—'}
                  </span>,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    {s.url && (
                      <Btn size="sm" variant="ghost" onClick={() => window.open(s.url!, '_blank')}>View</Btn>
                    )}
                    <label style={{ cursor: 'pointer' }}>
                      <Btn size="sm" variant="ghost" disabled={uploading === s.id}>
                        {uploading === s.id ? 'Uploading...' : 'Upload'}
                      </Btn>
                      <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadSpec(s.id, e.target.files[0]); }} />
                    </label>
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
