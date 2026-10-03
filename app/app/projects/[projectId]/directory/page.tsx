'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UsersThree, Plus, EnvelopeSimple, Phone, Buildings } from '@phosphor-icons/react';
import Suggest from '@/components/ui/Suggest';

/**
 * The project directory — everyone on this job, in one place.
 *
 * The prime contract asks for the owner. Every RFI asks for the architect. The
 * pay application asks for both again, and submittals want the engineer. None
 * of them kept the answer, so a GC retyped the same five names across the life
 * of a project and any one of them could be spelled differently on a legal
 * document than on the one beside it.
 *
 * The owner and architect land here automatically the moment a project is
 * created, because that is when the GC types them. Everyone else is added once.
 *
 * Reads and writes /api/projects/[id]/directory — the same endpoint the field
 * app uses. There were already two contact tables and two APIs in here; a
 * third would have been the exact problem this work is meant to remove.
 */

const GOLD = 'var(--brand-primary)';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const CARD = 'var(--bg-surface)';
const BASE = 'var(--bg-base)';

/* The roles a job actually has. Free text is still allowed — this is a prompt,
   not a schema. */
const ROLES = [
  'Owner', 'Owner Rep', 'Architect', 'Structural Engineer', 'MEP Engineer',
  'Civil Engineer', 'Project Manager', 'Superintendent', 'Estimator',
  'Inspector', 'Building Official', 'Lender', 'Insurer',
];

interface Contact {
  id?: string;
  name: string;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
}

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
  color: TEXT, fontSize: 16, outline: 'none', minHeight: 44,
};

export default function ProjectDirectory() {
  const params = useParams();
  const projectId = String(params['projectId'] || '');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Contact>({ name: '', role: 'Project Manager' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the directory.');
      setContacts(body.contacts ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save that contact.');
      setDraft({ name: '', role: 'Project Manager' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that contact.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ background: BASE, minHeight: '100%', padding: '24px max(20px, 3vw) 64px' }}>
      <div style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <UsersThree size={20} weight="duotone" color={GOLD} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>Directory</h1>
        </div>
        <p style={{ margin: '0 0 20px', color: DIM, fontSize: 13.5, maxWidth: 620, lineHeight: 1.55 }}>
          Everyone on this job. Contracts, RFIs, submittals and pay applications read these names
          instead of asking for them again.
        </p>

        {error && <p style={{ color: '#EF4444', fontSize: 13.5 }}>{error}</p>}

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
              padding: '0 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: GOLD, color: '#0A0A00', fontSize: 14, fontWeight: 800, marginBottom: 18,
            }}
          >
            <Plus size={15} weight="bold" color="#0A0A00" /> Add Someone
          </button>
        )}

        {adding && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Name</span>
                <input autoFocus style={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Role</span>
                <Suggest style={input} value={draft.role ?? ''} onChange={(e) => setDraft({ ...draft, role: e.target.value })} options={['r']} />
                </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Company</span>
                <input style={input} value={draft.company ?? ''} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Email</span>
                <input type="email" style={input} value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Phone</span>
                <input style={input} value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={save}
                disabled={saving || !draft.name.trim()}
                style={{
                  minHeight: 44, padding: '0 22px', borderRadius: 9, border: 'none',
                  background: draft.name.trim() ? GOLD : 'color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                  color: '#0A0A00', fontSize: 14, fontWeight: 800,
                  cursor: saving || !draft.name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Add to Directory'}
              </button>
              <button
                onClick={() => { setAdding(false); setDraft({ name: '', role: 'Project Manager' }); }}
                style={{ minHeight: 44, padding: '0 18px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: DIM, fontSize: 13.5 }}>Loading the directory…</p>
        ) : contacts.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '26px 22px', color: DIM, fontSize: 13.5, lineHeight: 1.6 }}>
            Nobody on this job yet. The owner and architect land here automatically when a project is
            created with them filled in — add the engineer, the PM and the superintendent once, and
            every document that needs them will have them.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {contacts.map((c, i) => (
              <div key={c.id ?? `${c.name}-${i}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '15px 17px' }}>
                {c.role && (
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, marginBottom: 5 }}>
                    {c.role}
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginBottom: 3 }}>{c.name}</div>
                {c.company && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: DIM, marginBottom: 8 }}>
                    <Buildings size={12} weight="duotone" color={DIM} /> {c.company}
                  </div>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: DIM, textDecoration: 'none', minHeight: 26 }}>
                    <EnvelopeSimple size={12} weight="duotone" color={DIM} /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: DIM, textDecoration: 'none', minHeight: 26 }}>
                    <Phone size={12} weight="duotone" color={DIM} /> {c.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
