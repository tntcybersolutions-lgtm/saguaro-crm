'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#161b22', BORDER = '#30363d';
const DIM = '#8B9DB8', TEXT = '#F0F4FF', GREEN = '#2ea043', BLUE = '#3B82F6';

interface ProjectContact {
  id: string;
  role: string;
  role_label: string | null;
  company: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  phone_mobile: string | null;
  phone_office: string | null;
  is_primary_contact: boolean;
  is_primary: boolean;
  subcontractor_id: string | null;
  notes: string | null;
  is_active: boolean;
}

const ROLE_GROUPS = [
  { key: 'owner',               label: 'Owner',              icon: '🏢' },
  { key: 'owners_rep',          label: "Owner's Rep",         icon: '👔' },
  { key: 'architect',           label: 'Architect',           icon: '📐' },
  { key: 'structural_engineer', label: 'Structural Engineer', icon: '🔩' },
  { key: 'mep_engineer',        label: 'MEP Engineer',        icon: '⚡' },
  { key: 'civil_engineer',      label: 'Civil Engineer',      icon: '🌍' },
  { key: 'geotechnical',        label: 'Geotechnical',        icon: '🪨' },
  { key: 'landscape',           label: 'Landscape',           icon: '🌿' },
  { key: 'gc_pm',               label: 'GC Project Manager',  icon: '📋' },
  { key: 'gc_superintendent',   label: 'Superintendent',      icon: '🦺' },
  { key: 'gc_foreman',          label: 'Foreman',             icon: '🔨' },
  { key: 'inspector',           label: 'Inspector',           icon: '🔍' },
  { key: 'ahj',                 label: 'AHJ',                 icon: '🏛️' },
  { key: 'subcontractor',       label: 'Subcontractors',      icon: '🔧' },
  { key: 'other',               label: 'Other',               icon: '👤' },
];

const ROLE_OPTIONS = ROLE_GROUPS.map((r) => ({ value: r.key, label: r.label }));

export default function DirectoryPage() {
  const { projectId } = useParams() as { projectId: string };
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: '', role: 'other', company: '', title: '', email: '',
    phone_mobile: '', phone_office: '', is_primary_contact: false, notes: '',
  });

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project-contacts/${projectId}`);
      const data = await res.json();
      setContacts((data.contacts || []).filter((c: ProjectContact) => c.is_active !== false));
    } catch { /* handled */ } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const groupedContacts = useMemo(() => {
    const groups: Record<string, ProjectContact[]> = {};
    for (const rg of ROLE_GROUPS) groups[rg.key] = [];
    for (const c of filtered) {
      const role = c.role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(c);
    }
    return groups;
  }, [filtered]);

  const handleAddContact = async () => {
    if (!form.name || !form.role) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/project-contacts/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({ name: '', role: 'other', company: '', title: '', email: '',
          phone_mobile: '', phone_office: '', is_primary_contact: false, notes: '' });
        await fetchContacts();
      }
    } finally { setSaving(false); }
  };

  const handleSeedFromSubs = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`/api/project-contacts/${projectId}/seed-from-subs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) await fetchContacts();
    } finally { setSeeding(false); }
  };

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedGroups(next);
  };

  const handleDeleteContact = async (contactId: string) => {
    await fetch(`/api/project-contacts/${projectId}/${contactId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    });
    await fetchContacts();
  };

  const getPhone = (c: ProjectContact) => c.phone_mobile || c.phone_office || c.phone || null;

  // Stats
  const totalContacts = contacts.length;
  const rolesWithContacts = ROLE_GROUPS.filter((rg) => (groupedContacts[rg.key] || []).length > 0).length;
  const primaryCount = contacts.filter((c) => c.is_primary_contact || c.is_primary).length;
  const subCount = (groupedContacts['subcontractor'] || []).length;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: DARK, border: `1px solid ${BORDER}`,
    borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { color: DIM, fontSize: 12, marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 24, margin: 0 }}>Project Directory</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSeedFromSubs} disabled={seeding}
            style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
              borderRadius: 6, color: BLUE, cursor: 'pointer', fontSize: 12 }}>
            {seeding ? 'Seeding...' : 'Seed from Subs'}
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ padding: '8px 16px', background: GOLD, color: '#000', border: 'none',
              borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            + Add Contact
          </button>
        </div>
      </div>

      {/* SEARCH */}
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts..."
        style={{ ...inputStyle, marginBottom: 20 }} />

      {/* STATS BAR */}
      {contacts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Contacts', value: String(totalContacts), color: TEXT },
            { label: 'Roles Covered', value: `${rolesWithContacts} / ${ROLE_GROUPS.length}`, color: GOLD },
            { label: 'Primary Contacts', value: String(primaryCount), color: GREEN },
            { label: 'Subcontractors', value: String(subCount), color: BLUE },
          ].map((k) => (
            <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '12px', textAlign: 'center' }}>
              <div style={{ color: DIM, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ color: k.color, fontSize: 18, fontWeight: 700 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* CONTACT LIST BY ROLE */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: GOLD }}>Loading directory...</div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: DIM }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📒</div>
          <div style={{ fontSize: 18, marginBottom: 8, color: TEXT }}>No contacts yet</div>
          <div style={{ marginBottom: 24 }}>Add contacts manually or seed from your awarded subcontractors.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={handleSeedFromSubs}
              style={{ padding: '10px 20px', background: BLUE, color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              Seed from Subs
            </button>
            <button onClick={() => setShowModal(true)}
              style={{ padding: '10px 20px', background: GOLD, color: '#000', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              + Add Contact
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ROLE_GROUPS.map((rg) => {
            const roleContacts = groupedContacts[rg.key] || [];
            if (roleContacts.length === 0) return null;

            const isSubGroup = rg.key === 'subcontractor';
            const isExpanded = !isSubGroup || expandedGroups.has(rg.key);

            return (
              <div key={rg.key}>
                <div onClick={() => isSubGroup && toggleGroup(rg.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    cursor: isSubGroup ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: 18 }}>{rg.icon}</span>
                  <span style={{ color: GOLD, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {rg.label}
                  </span>
                  <span style={{ color: DIM, fontSize: 12 }}>({roleContacts.length})</span>
                  {isSubGroup && (
                    <span style={{ color: DIM, fontSize: 12, marginLeft: 'auto' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {roleContacts.map((c) => (
                      <div key={c.id} style={{ background: RAISED, border: `1px solid ${BORDER}`,
                        borderRadius: 8, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                          {(c.is_primary_contact || c.is_primary) && (
                            <span style={{ fontSize: 12 }} title="Primary Contact">⭐</span>
                          )}
                          {c.title && <span style={{ color: DIM, fontSize: 12 }}>— {c.title}</span>}
                        </div>
                        {c.company && (
                          <div style={{ color: DIM, fontSize: 12, marginBottom: 6 }}>{c.company}</div>
                        )}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          {getPhone(c) && (
                            <a href={`tel:${getPhone(c)}`}
                              style={{ color: BLUE, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                              📱 {getPhone(c)}
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`}
                              style={{ color: BLUE, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                              📧 {c.email}
                            </a>
                          )}
                          {c.phone_office && c.phone_office !== c.phone_mobile && (
                            <a href={`tel:${c.phone_office}`}
                              style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>
                              Office: {c.phone_office}
                            </a>
                          )}
                          {c.notes && (
                            <span style={{ color: DIM, fontSize: 11, fontStyle: 'italic' }}>
                              {c.notes}
                            </span>
                          )}
                          <button onClick={() => handleDeleteContact(c.id)}
                            style={{ marginLeft: 'auto', padding: '2px 8px', background: 'transparent',
                              border: `1px solid ${BORDER}`, borderRadius: 4, color: DIM,
                              cursor: 'pointer', fontSize: 11 }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ADD CONTACT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: GOLD, margin: '0 0 20px', fontSize: 18 }}>Add Contact</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle} placeholder="Full name" />
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Company</label>
                <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                  style={inputStyle} placeholder="Company name" />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={inputStyle} placeholder="Job title" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle} type="email" placeholder="email@company.com" />
              </div>
              <div>
                <label style={labelStyle}>Mobile Phone</label>
                <input value={form.phone_mobile} onChange={(e) => setForm({ ...form, phone_mobile: e.target.value })}
                  style={inputStyle} type="tel" placeholder="(555) 123-4567" />
              </div>
              <div>
                <label style={labelStyle}>Office Phone</label>
                <input value={form.phone_office} onChange={(e) => setForm({ ...form, phone_office: e.target.value })}
                  style={inputStyle} type="tel" placeholder="(555) 123-4567" />
              </div>
              <div style={{ gridColumn: '1/3', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={form.is_primary_contact}
                  onChange={(e) => setForm({ ...form, is_primary_contact: e.target.checked })} />
                <span style={{ color: TEXT, fontSize: 13 }}>Primary contact for this role</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: DIM, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAddContact} disabled={saving || !form.name}
                style={{ padding: '10px 24px', background: GOLD, color: '#000', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
