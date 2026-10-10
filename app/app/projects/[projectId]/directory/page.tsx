'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { UsersThree, Plus, EnvelopeSimple, Phone, Buildings, PencilSimple, Trash } from '@phosphor-icons/react';
import Suggest from '@/components/ui/Suggest';
import { confirmDialog } from '@/lib/ui/async-dialog';

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
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const BORDER = 'var(--surface-raised)';
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
  /* Three different failures, shown where the person is looking: the list
     could not load (in place of the list, with Try Again), a save failed
     (inside the form, beside Save), a remove failed (on the page). */
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Contact>({ name: '', role: 'Project Manager' });
  const [adding, setAdding] = useState(false);
  /* Non-null while the form is editing an existing person (same form as Add). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const closeForm = () => { setAdding(false); setEditingId(null); setFormError(''); setDraft({ name: '', role: 'Project Manager' }); };
  const startEdit = (c: Contact) => {
    if (!c.id) return;
    setEditingId(c.id);
    setDraft({ name: c.name || '', role: c.role ?? '', company: c.company ?? '', email: c.email ?? '', phone: c.phone ?? '' });
    setAdding(true);
    setFormError('');
    setError('');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const remove = async (c: Contact) => {
    if (!c.id) return;
    const ok = await confirmDialog({
      title: `Remove ${c.name}?`,
      message: `${c.name}${c.role ? ` (${c.role})` : ''} comes off this job's directory. Documents already written keep the name they were written with.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setRemovingId(c.id);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/directory/${c.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not remove that contact.');
      if (editingId === c.id) closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that contact.');
    } finally {
      setRemovingId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the directory.');
      setContacts(body.contacts ?? []);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setFormError('');
    try {
      const res = editingId
        ? await fetch(`/api/projects/${projectId}/directory/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: draft.name, role: draft.role ?? null, company: draft.company ?? null, email: draft.email ?? null, phone: draft.phone ?? null }),
          })
        : await fetch(`/api/projects/${projectId}/directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save that contact.');
      closeForm();
      setError('');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save that contact.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ background: BASE, minHeight: '100%', padding: '24px max(20px, 3vw) 64px' }}>
      <div style={{ maxWidth: 2200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <UsersThree size={20} weight="duotone" color={GOLD} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>Directory</h1>
        </div>
        <p style={{ margin: '0 0 20px', color: DIM, fontSize: 13.5, maxWidth: 620, lineHeight: 1.55 }}>
          Everyone on this job. Contracts, RFIs, submittals and pay applications read these names
          instead of asking for them again.
        </p>

        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13.5 }}>{error}</p>}
        {loadError && contacts.length > 0 && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13.5 }}>{loadError}</p>}

        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setFormError(''); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
              padding: '0 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: GOLD, color: 'var(--on-brand)', fontSize: 14, fontWeight: 800, marginBottom: 18,
            }}
          >
            <Plus size={15} weight="bold" color="var(--on-brand)" /> Add Someone
          </button>
        )}

        {adding && (
          /* A real form: the keyboard's Go / Enter saves, the same as the button. */
          <form ref={formRef} onSubmit={save} aria-label={editingId ? 'Edit contact' : 'Add someone to the directory'} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
            {editingId && (
              <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 10 }}>Edit Contact</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Name</span>
                <input autoFocus required aria-required="true" style={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Role</span>
                <Suggest style={input} value={draft.role ?? ''} onChange={(e) => setDraft({ ...draft, role: e.target.value })} options={ROLES} placeholder="Pick or type a role" />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Company</span>
                <input style={input} value={draft.company ?? ''} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Email</span>
                <input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" style={input} value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Phone</span>
                <input type="tel" inputMode="tel" autoComplete="off" style={input} value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </label>
            </div>
            {formError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13.5, margin: '12px 0 0' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={saving || !draft.name.trim()}
                style={{
                  minHeight: 44, padding: '0 22px', borderRadius: 9, border: 'none',
                  background: draft.name.trim() ? GOLD : 'color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                  color: 'var(--on-brand)', fontSize: 14, fontWeight: 800,
                  cursor: saving || !draft.name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add to Directory'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{ minHeight: 44, padding: '0 18px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && contacts.length === 0 ? (
          <p style={{ color: DIM, fontSize: 13.5 }}>Loading the directory…</p>
        ) : loadError && contacts.length === 0 ? (
          /* A failed read is not an empty job: say so, and offer the retry. */
          <div role="alert" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 22px', color: TEXT, fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 10 }}>{loadError}</div>
            <button
              type="button"
              onClick={() => load()}
              style={{ minHeight: 44, padding: '0 18px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
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
                {c.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <PencilSimple size={13} weight="bold" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={removingId === c.id}
                      aria-label={`Remove ${c.name} from the directory`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: 'var(--danger)', fontSize: 13, fontWeight: 700, cursor: removingId === c.id ? 'default' : 'pointer', opacity: removingId === c.id ? 0.6 : 1 }}
                    >
                      <Trash size={13} weight="bold" /> {removingId === c.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
