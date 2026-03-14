'use client';
/**
 * Saguaro Field — Project Directory
 * Full contact management: companies, people, distribution groups, quick actions.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CONTRACTOR_TRADES as TRADES } from '@/lib/contractor-trades';

const GOLD = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';

/* ── Types ─────────────────────────────────────────────── */

interface Company {
  id: string;
  name: string;
  trade: string;
  license_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  insurance_expiry?: string;
}

interface Person {
  id: string;
  name: string;
  title?: string;
  company_id?: string;
  company_name?: string;
  phone?: string;
  email?: string;
  role_on_project?: string;
  permission_role?: 'Admin' | 'PM' | 'Superintendent' | 'Foreman' | 'Read-Only';
}

interface DistributionGroup {
  id: string;
  name: string;
  member_ids: string[];
}

type ContactType = 'company' | 'person';
type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'groups';

const PERMISSION_COLORS: Record<string, string> = {
  Admin: RED,
  PM: GOLD,
  Superintendent: GREEN,
  Foreman: BLUE,
  'Read-Only': DIM,
};

// TRADES imported from @/lib/contractor-trades

const PERMISSION_ROLES = ['Admin', 'PM', 'Superintendent', 'Foreman', 'Read-Only'] as const;

/* ── Helpers ───────────────────────────────────────────── */

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(d: string | undefined): boolean {
  if (!d) return false;
  return new Date(d) < new Date();
}

function isExpiringSoon(d: string | undefined): boolean {
  if (!d) return false;
  const diff = new Date(d).getTime() - Date.now();
  return diff > 0 && diff < 30 * 86400000;
}

/* ── Styles ────────────────────────────────────────────── */

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#0A1628', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '10px 22px', background: GOLD, color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '10px 22px', background: 'transparent', color: DIM, fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: 10, cursor: 'pointer', fontSize: 14 };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 };
const badge = (bg: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${bg}22`, color: bg });
const quickBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${BORDER}`, background: '#0A1628', cursor: 'pointer', textDecoration: 'none' };
const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '8px 18px', background: active ? GOLD : 'transparent', color: active ? '#000' : DIM, fontWeight: 700, border: `1px solid ${active ? GOLD : BORDER}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, transition: 'all .2s' });
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 4, display: 'block' };

/* ── Main Component ────────────────────────────────────── */

function DirectoryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [contactTab, setContactTab] = useState<ContactType | 'groups'>('company');
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form fields — Company
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formTrade, setFormTrade] = useState('');
  const [formLicense, setFormLicense] = useState('');
  const [formCompanyPhone, setFormCompanyPhone] = useState('');
  const [formCompanyEmail, setFormCompanyEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formInsuranceExpiry, setFormInsuranceExpiry] = useState('');

  // Form fields — Person
  const [formPersonName, setFormPersonName] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formPersonCompanyId, setFormPersonCompanyId] = useState('');
  const [formPersonPhone, setFormPersonPhone] = useState('');
  const [formPersonEmail, setFormPersonEmail] = useState('');
  const [formRoleOnProject, setFormRoleOnProject] = useState('');
  const [formPermission, setFormPermission] = useState<string>('Read-Only');

  // Distribution group form
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupMembers, setFormGroupMembers] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Which type we are creating/editing
  const [formType, setFormType] = useState<ContactType>('company');

  const fetchDirectory = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`);
      if (!res.ok) throw new Error('Failed to load directory');
      const data = await res.json();
      setCompanies(data.companies || []);
      setPeople(data.people || []);
      setGroups(data.groups || []);
    } catch {
      setError('Unable to load project directory');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDirectory(); }, [fetchDirectory]);

  /* ── Save contact ─────────────────────────────────────── */

  const handleSaveContact = async () => {
    setSaving(true);
    setError('');
    try {
      const isEdit = view === 'edit';
      const body = formType === 'company'
        ? {
          type: 'company',
          id: isEdit ? selectedCompany?.id : undefined,
          name: formCompanyName,
          trade: formTrade,
          license_number: formLicense,
          phone: formCompanyPhone,
          email: formCompanyEmail,
          address: formAddress,
          insurance_expiry: formInsuranceExpiry || undefined,
        }
        : {
          type: 'person',
          id: isEdit ? selectedPerson?.id : undefined,
          name: formPersonName,
          title: formTitle,
          company_id: formPersonCompanyId || undefined,
          phone: formPersonPhone,
          email: formPersonEmail,
          role_on_project: formRoleOnProject,
          permission_role: formPermission,
        };
      const res = await fetch(`/api/projects/${projectId}/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      await fetchDirectory();
      setView('list');
    } catch {
      setError('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  /* ── Save distribution group ──────────────────────────── */

  const handleSaveGroup = async () => {
    if (!formGroupName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          id: editingGroupId || undefined,
          name: formGroupName,
          member_ids: formGroupMembers,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      await fetchDirectory();
      setFormGroupName('');
      setFormGroupMembers([]);
      setEditingGroupId(null);
    } catch {
      setError('Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  /* ── Populate form for editing ────────────────────────── */

  const editCompany = (c: Company) => {
    setFormType('company');
    setFormCompanyName(c.name);
    setFormTrade(c.trade);
    setFormLicense(c.license_number || '');
    setFormCompanyPhone(c.phone || '');
    setFormCompanyEmail(c.email || '');
    setFormAddress(c.address || '');
    setFormInsuranceExpiry(c.insurance_expiry || '');
    setSelectedCompany(c);
    setView('edit');
  };

  const editPerson = (p: Person) => {
    setFormType('person');
    setFormPersonName(p.name);
    setFormTitle(p.title || '');
    setFormPersonCompanyId(p.company_id || '');
    setFormPersonPhone(p.phone || '');
    setFormPersonEmail(p.email || '');
    setFormRoleOnProject(p.role_on_project || '');
    setFormPermission(p.permission_role || 'Read-Only');
    setSelectedPerson(p);
    setView('edit');
  };

  const resetForm = () => {
    setFormCompanyName(''); setFormTrade(''); setFormLicense(''); setFormCompanyPhone('');
    setFormCompanyEmail(''); setFormAddress(''); setFormInsuranceExpiry('');
    setFormPersonName(''); setFormTitle(''); setFormPersonCompanyId('');
    setFormPersonPhone(''); setFormPersonEmail(''); setFormRoleOnProject(''); setFormPermission('Read-Only');
    setSelectedCompany(null); setSelectedPerson(null);
  };

  /* ── Filtering ────────────────────────────────────────── */

  const filteredCompanies = companies.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.trade.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTrade && c.trade !== filterTrade) return false;
    return true;
  });

  const filteredPeople = people.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.company_name || '').toLowerCase().includes(search.toLowerCase()) && !(p.role_on_project || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCompany && p.company_id !== filterCompany) return false;
    if (filterRole && p.permission_role !== filterRole) return false;
    return true;
  });

  /* ── Alphabetical index ───────────────────────────────── */

  const letters = Array.from(new Set(
    (contactTab === 'company' ? filteredCompanies.map((c) => c.name[0]) : filteredPeople.map((p) => p.name[0]))
      .filter(Boolean)
      .map((l) => l.toUpperCase())
  )).sort();

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── No project guard ─────────────────────────────────── */

  if (!projectId) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: RED, fontWeight: 600 }}>No project selected.</p>
        <button onClick={() => router.push('/field')} style={btnPrimary}>Back to Projects</button>
      </div>
    );
  }

  /* ── Render: Create / Edit Form ───────────────────────── */

  if (view === 'create' || view === 'edit') {
    return (
      <div style={{ padding: '18px 16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => { setView('list'); resetForm(); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: TEXT }}>{view === 'edit' ? 'Edit' : 'New'} Contact</h1>

        {view === 'create' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setFormType('company')} style={tabStyle(formType === 'company')}>Company</button>
            <button onClick={() => setFormType('person')} style={tabStyle(formType === 'person')}>Person</button>
          </div>
        )}

        {error && <div style={{ ...card, borderColor: RED, color: RED, padding: 12, marginBottom: 12 }}>{error}</div>}

        <div style={card}>
          {formType === 'company' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={labelStyle}>Company Name *</label><input style={inputStyle} value={formCompanyName} onChange={(e) => setFormCompanyName(e.target.value)} placeholder="ABC Construction" /></div>
              <div><label style={labelStyle}>Trade *</label><select style={selectStyle} value={formTrade} onChange={(e) => setFormTrade(e.target.value)}><option value="">Select trade...</option>{TRADES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelStyle}>License #</label><input style={inputStyle} value={formLicense} onChange={(e) => setFormLicense(e.target.value)} /></div>
              <div><label style={labelStyle}>Phone</label><input style={inputStyle} type="tel" value={formCompanyPhone} onChange={(e) => setFormCompanyPhone(e.target.value)} /></div>
              <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={formCompanyEmail} onChange={(e) => setFormCompanyEmail(e.target.value)} /></div>
              <div><label style={labelStyle}>Address</label><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></div>
              <div><label style={labelStyle}>Insurance Expiry</label><input style={inputStyle} type="date" value={formInsuranceExpiry} onChange={(e) => setFormInsuranceExpiry(e.target.value)} /></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={formPersonName} onChange={(e) => setFormPersonName(e.target.value)} placeholder="John Smith" /></div>
              <div><label style={labelStyle}>Title</label><input style={inputStyle} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Project Engineer" /></div>
              <div><label style={labelStyle}>Company</label><select style={selectStyle} value={formPersonCompanyId} onChange={(e) => setFormPersonCompanyId(e.target.value)}><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label style={labelStyle}>Phone</label><input style={inputStyle} type="tel" value={formPersonPhone} onChange={(e) => setFormPersonPhone(e.target.value)} /></div>
              <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={formPersonEmail} onChange={(e) => setFormPersonEmail(e.target.value)} /></div>
              <div><label style={labelStyle}>Role on Project</label><input style={inputStyle} value={formRoleOnProject} onChange={(e) => setFormRoleOnProject(e.target.value)} placeholder="Superintendent" /></div>
              <div><label style={labelStyle}>Permission Role</label><select style={selectStyle} value={formPermission} onChange={(e) => setFormPermission(e.target.value)}>{PERMISSION_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={handleSaveContact} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : view === 'edit' ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setView('list'); resetForm(); }} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: Company Detail ───────────────────────────── */

  if (view === 'detail' && selectedCompany) {
    const companyPeople = people.filter((p) => p.company_id === selectedCompany.id);
    const insColor = isExpired(selectedCompany.insurance_expiry) ? RED : isExpiringSoon(selectedCompany.insurance_expiry) ? AMBER : GREEN;

    return (
      <div style={{ padding: '18px 16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => { setView('list'); setSelectedCompany(null); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontWeight: 800, fontSize: 18 }}>
              {initials(selectedCompany.name)}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedCompany.name}</h2>
              <span style={badge(BLUE)}>{selectedCompany.trade}</span>
            </div>
            <button onClick={() => editCompany(selectedCompany)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 12 }}>Edit</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {selectedCompany.license_number && (
              <div><span style={{ fontSize: 11, color: DIM }}>License #</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedCompany.license_number}</div></div>
            )}
            {selectedCompany.phone && (
              <div><span style={{ fontSize: 11, color: DIM }}>Phone</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedCompany.phone}</div></div>
            )}
            {selectedCompany.email && (
              <div><span style={{ fontSize: 11, color: DIM }}>Email</span><div style={{ color: TEXT, fontSize: 14, wordBreak: 'break-all' }}>{selectedCompany.email}</div></div>
            )}
            {selectedCompany.insurance_expiry && (
              <div><span style={{ fontSize: 11, color: DIM }}>Insurance Expiry</span><div style={{ color: insColor, fontSize: 14, fontWeight: 600 }}>{formatDate(selectedCompany.insurance_expiry)}</div></div>
            )}
          </div>

          {selectedCompany.address && (
            <div style={{ marginTop: 10 }}><span style={{ fontSize: 11, color: DIM }}>Address</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedCompany.address}</div></div>
          )}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {selectedCompany.phone && <a href={`tel:${selectedCompany.phone}`} style={quickBtn} title="Call"><svg viewBox="0 0 24 24" fill={GREEN} width={18} height={18}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>}
            {selectedCompany.email && <a href={`mailto:${selectedCompany.email}`} style={quickBtn} title="Email"><svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={18} height={18}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M22 7l-10 7L2 7"/></svg></a>}
            {selectedCompany.phone && <a href={`sms:${selectedCompany.phone}`} style={quickBtn} title="Text"><svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} width={18} height={18}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></a>}
          </div>
        </div>

        {/* People at this company */}
        {companyPeople.length > 0 && (
          <>
            <h3 style={{ color: TEXT, fontSize: 16, fontWeight: 700, margin: '16px 0 8px' }}>Team Members ({companyPeople.length})</h3>
            {companyPeople.map((p) => (
              <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => { setSelectedPerson(p); setSelectedCompany(null); }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${PERMISSION_COLORS[p.permission_role || 'Read-Only']}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PERMISSION_COLORS[p.permission_role || 'Read-Only'], fontWeight: 700, fontSize: 14 }}>
                  {initials(p.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ color: DIM, fontSize: 12 }}>{p.title || p.role_on_project || '\u2014'}</div>
                </div>
                {p.permission_role && <span style={badge(PERMISSION_COLORS[p.permission_role] || DIM)}>{p.permission_role}</span>}
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  /* ── Render: Person Detail ────────────────────────────── */

  if (view === 'detail' && selectedPerson) {
    const pc = PERMISSION_COLORS[selectedPerson.permission_role || 'Read-Only'] || DIM;
    return (
      <div style={{ padding: '18px 16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => { setView('list'); setSelectedPerson(null); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${pc}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pc, fontWeight: 800, fontSize: 18 }}>
              {initials(selectedPerson.name)}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedPerson.name}</h2>
              {selectedPerson.title && <div style={{ color: DIM, fontSize: 13 }}>{selectedPerson.title}</div>}
            </div>
            <button onClick={() => editPerson(selectedPerson)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 12 }}>Edit</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {selectedPerson.company_name && (
              <div><span style={{ fontSize: 11, color: DIM }}>Company</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedPerson.company_name}</div></div>
            )}
            {selectedPerson.role_on_project && (
              <div><span style={{ fontSize: 11, color: DIM }}>Role on Project</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedPerson.role_on_project}</div></div>
            )}
            {selectedPerson.phone && (
              <div><span style={{ fontSize: 11, color: DIM }}>Phone</span><div style={{ color: TEXT, fontSize: 14 }}>{selectedPerson.phone}</div></div>
            )}
            {selectedPerson.email && (
              <div><span style={{ fontSize: 11, color: DIM }}>Email</span><div style={{ color: TEXT, fontSize: 14, wordBreak: 'break-all' }}>{selectedPerson.email}</div></div>
            )}
          </div>

          {selectedPerson.permission_role && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: DIM }}>Permission Level</span>
              <div style={{ marginTop: 4 }}><span style={badge(pc)}>{selectedPerson.permission_role}</span></div>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {selectedPerson.phone && <a href={`tel:${selectedPerson.phone}`} style={quickBtn} title="Call"><svg viewBox="0 0 24 24" fill={GREEN} width={18} height={18}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>}
            {selectedPerson.email && <a href={`mailto:${selectedPerson.email}`} style={quickBtn} title="Email"><svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={18} height={18}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M22 7l-10 7L2 7"/></svg></a>}
            {selectedPerson.phone && <a href={`sms:${selectedPerson.phone}`} style={quickBtn} title="Text"><svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} width={18} height={18}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></a>}
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: Main List View ───────────────────────────── */

  return (
    <div style={{ padding: '18px 16px', maxWidth: 700, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Project Directory</h1>
        <button onClick={() => { resetForm(); setView('create'); }} style={{ ...btnPrimary, padding: '8px 16px', fontSize: 13 }}>+ Add</button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} width={18} height={18} style={{ position: 'absolute', left: 12, top: 11 }}>
          <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
        </svg>
        <input style={{ ...inputStyle, paddingLeft: 38 }} placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setContactTab('company')} style={tabStyle(contactTab === 'company')}>Companies ({companies.length})</button>
        <button onClick={() => setContactTab('person')} style={tabStyle(contactTab === 'person')}>People ({people.length})</button>
        <button onClick={() => setContactTab('groups')} style={tabStyle(contactTab === 'groups')}>Groups ({groups.length})</button>
      </div>

      {/* Filters */}
      {contactTab === 'company' && (
        <div style={{ marginBottom: 12 }}>
          <select style={{ ...selectStyle, width: 'auto', display: 'inline-block', minWidth: 160 }} value={filterTrade} onChange={(e) => setFilterTrade(e.target.value)}>
            <option value="">All Trades</option>
            {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {contactTab === 'person' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select style={{ ...selectStyle, width: 'auto', minWidth: 140 }} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={{ ...selectStyle, width: 'auto', minWidth: 140 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">All Roles</option>
            {PERMISSION_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading directory...</div>}
      {error && <div style={{ ...card, borderColor: RED, color: RED, padding: 12 }}>{error}</div>}

      {/* Alphabetical index */}
      {!loading && (contactTab === 'company' || contactTab === 'person') && letters.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {letters.map((l) => (
            <button key={l} onClick={() => scrollToLetter(l)} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: GOLD, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Company list */}
      {!loading && contactTab === 'company' && (
        <>
          {filteredCompanies.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: DIM }}>No companies found</div>}
          {letters.map((letter) => {
            const group = filteredCompanies.filter((c) => c.name[0]?.toUpperCase() === letter);
            if (group.length === 0) return null;
            return (
              <div key={letter} id={`letter-${letter}`}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, margin: '14px 0 6px', borderBottom: `1px solid ${BORDER}`, paddingBottom: 4 }}>{letter}</div>
                {group.map((c) => {
                  const insColor = isExpired(c.insurance_expiry) ? RED : isExpiringSoon(c.insurance_expiry) ? AMBER : GREEN;
                  return (
                    <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => { setSelectedCompany(c); setView('detail'); }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                        {initials(c.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ color: DIM, fontSize: 12 }}>{c.trade}{c.license_number ? ` \u00B7 #${c.license_number}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {c.insurance_expiry && <span style={badge(insColor)}>Ins {formatDate(c.insurance_expiry)}</span>}
                        {c.phone && <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} style={quickBtn} title="Call"><svg viewBox="0 0 24 24" fill={GREEN} width={16} height={16}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>}
                        {c.email && <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} style={quickBtn} title="Email"><svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={16} height={16}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M22 7l-10 7L2 7"/></svg></a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      {/* People list */}
      {!loading && contactTab === 'person' && (
        <>
          {filteredPeople.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: DIM }}>No people found</div>}
          {letters.map((letter) => {
            const group = filteredPeople.filter((p) => p.name[0]?.toUpperCase() === letter);
            if (group.length === 0) return null;
            return (
              <div key={letter} id={`letter-${letter}`}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, margin: '14px 0 6px', borderBottom: `1px solid ${BORDER}`, paddingBottom: 4 }}>{letter}</div>
                {group.map((p) => {
                  const pc = PERMISSION_COLORS[p.permission_role || 'Read-Only'] || DIM;
                  return (
                    <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => { setSelectedPerson(p); setView('detail'); }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${pc}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pc, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                        {initials(p.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ color: DIM, fontSize: 12 }}>{p.company_name || ''}{p.role_on_project ? ` \u00B7 ${p.role_on_project}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        {p.permission_role && <span style={badge(pc)}>{p.permission_role}</span>}
                        {p.phone && <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} style={quickBtn} title="Call"><svg viewBox="0 0 24 24" fill={GREEN} width={16} height={16}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>}
                        {p.email && <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} style={quickBtn} title="Email"><svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} width={16} height={16}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M22 7l-10 7L2 7"/></svg></a>}
                        {p.phone && <a href={`sms:${p.phone}`} onClick={(e) => e.stopPropagation()} style={quickBtn} title="Text"><svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} width={16} height={16}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      {/* Distribution Groups */}
      {!loading && contactTab === 'groups' && (
        <div>
          {/* Create / Edit group form */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>{editingGroupId ? 'Edit Group' : 'Create Distribution Group'}</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Group Name</label>
              <input style={inputStyle} placeholder='e.g., All Subs, Safety Committee' value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Members</label>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, background: '#0A1628' }}>
                {people.length === 0 && <div style={{ color: DIM, fontSize: 13, padding: 8 }}>No people in directory yet</div>}
                {people.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', color: TEXT, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={formGroupMembers.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) setFormGroupMembers([...formGroupMembers, p.id]);
                        else setFormGroupMembers(formGroupMembers.filter((id) => id !== p.id));
                      }}
                      style={{ accentColor: GOLD }}
                    />
                    {p.name}{p.company_name ? ` (${p.company_name})` : ''}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveGroup} disabled={saving || !formGroupName.trim()} style={{ ...btnPrimary, opacity: saving || !formGroupName.trim() ? 0.5 : 1 }}>
                {saving ? 'Saving...' : editingGroupId ? 'Update Group' : 'Create Group'}
              </button>
              {editingGroupId && (
                <button onClick={() => { setEditingGroupId(null); setFormGroupName(''); setFormGroupMembers([]); }} style={btnSecondary}>Cancel</button>
              )}
            </div>
          </div>

          {/* Existing groups */}
          {groups.length === 0 && !editingGroupId && <div style={{ textAlign: 'center', padding: 24, color: DIM }}>No distribution groups created</div>}
          {groups.map((g) => {
            const members = people.filter((p) => g.member_ids.includes(p.id));
            return (
              <div key={g.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{g.name}</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditingGroupId(g.id); setFormGroupName(g.name); setFormGroupMembers(g.member_ids); }} style={{ ...btnSecondary, padding: '4px 12px', fontSize: 11 }}>Edit</button>
                    {members.some((m) => m.email) && (
                      <a href={`mailto:${members.filter((m) => m.email).map((m) => m.email).join(',')}`} style={{ ...btnSecondary, padding: '4px 12px', fontSize: 11, textDecoration: 'none', color: BLUE }}>Email All</a>
                    )}
                  </div>
                </div>
                <div style={{ color: DIM, fontSize: 13 }}>{members.length} member{members.length !== 1 ? 's' : ''}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {members.map((m) => (
                    <span key={m.id} style={{ ...badge(BLUE), fontSize: 12, padding: '3px 10px' }}>{m.name}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DirectoryPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8' }}>Loading directory...</div>}>
      <DirectoryPage />
    </Suspense>
  );
}
