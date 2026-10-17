'use client';
/**
 * The project directory — everyone on this job, grouped by company.
 *
 * The prime contract asks for the owner. Every RFI asks for the architect. The
 * pay application asks for both again, and submittals want the engineer. This
 * screen keeps the answer once: contacts plus the job's subcontractor
 * companies, each company under its mark (logo, or a monogram in its own
 * stable token color) with its trade, and each person with their face
 * (profile photo when they sign in, initials otherwise) and one-tap call /
 * email. Grid or list, remembered on this device.
 *
 * Reads and writes /api/projects/[id]/directory — the same endpoint the field
 * app uses (GET also returns `companies` and each contact's `avatar_url` /
 * `trade`; both are read-only extras).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, EnvelopeSimple, Phone, PencilSimple, Trash, UsersThree, Buildings, Wrench, WarningCircle, ArrowClockwise, SquaresFour, Rows } from '@phosphor-icons/react';
import {
  PageShell, StatRow, Badge, Button, Toolbar, EmptyState, RowActions, FormModal, FormGrid, Field, Input,
  Toast, useToast, Avatar, CompanyMark, DataTable, type StatItem, type Column,
} from '@/components/ui/kit';
import { useEditRights } from '@/lib/hooks/usePermissions';
import { jsonRequest } from '@/lib/list-view';
import Suggest from '@/components/ui/Suggest';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { groupByCompany, telHref, mailHref, type DirContact, type DirCompany, type DirGroup } from '@/lib/directory-view';

/* The roles a job actually has. Free text is still allowed — this is a prompt, not a schema. */
const ROLES = [
  'Owner', 'Owner Rep', 'Architect', 'Structural Engineer', 'MEP Engineer',
  'Civil Engineer', 'Project Manager', 'Superintendent', 'Foreman', 'Estimator',
  'Inspector', 'Building Official', 'Lender', 'Insurer',
];
type View = 'grid' | 'list';
const VIEW_KEY = 'sag_dir_view';
const EMPTY: DirContact = { name: '', role: 'Project Manager', company: '', email: '', phone: '' };

export default function ProjectDirectory() {
  const params = useParams();
  const projectId = String(params['projectId'] || '');
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast(3500);
  const rights = useEditRights('Projects');

  const [contacts, setContacts] = useState<DirContact[]>([]);
  const [companies, setCompanies] = useState<DirCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DirContact>({ ...EMPTY });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('grid');

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'grid' || v === 'list') setView(v); }
    catch (e) { console.warn('[directory] view preference unavailable', e); }
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { console.warn('[directory] could not save view preference', e); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the directory.');
      setContacts(Array.isArray(body.contacts) ? body.contacts : []);
      setCompanies(Array.isArray(body.companies) ? body.companies : []);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const openAdd = (company?: string) => { setEditingId(null); setDraft({ ...EMPTY, company: company || '' }); setFormError(''); setOpen(true); };
  const openEdit = (c: DirContact) => {
    if (!c.id) return;
    setEditingId(c.id);
    setDraft({ name: c.name || '', role: c.role ?? '', company: c.company ?? '', email: c.email ?? '', phone: c.phone ?? '' });
    setFormError(''); setOpen(true);
  };
  const close = () => { if (saving) return; setOpen(false); setEditingId(null); setFormError(''); };

  const save = async () => {
    if (!draft.name.trim() || saving) { if (!draft.name.trim()) setFormError('Name is required.'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = { name: draft.name, role: draft.role ?? null, company: draft.company ?? null, email: draft.email ?? null, phone: draft.phone ?? null };
      const res = editingId
        ? await fetch(`/api/projects/${projectId}/directory/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(`/api/projects/${projectId}/directory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save that contact.');
      setOpen(false); setEditingId(null);
      show(editingId ? 'Contact updated.' : 'Added to the directory.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save that contact.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: DirContact) => {
    if (!c.id) return;
    const ok = await confirmDialog({
      title: `Remove ${c.name}?`,
      message: `${c.name}${c.role ? ` (${c.role})` : ''} comes off this job's directory. Documents already written keep the name they were written with.`,
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    setRemovingId(c.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/directory/${c.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not remove that contact.');
      show('Removed from the directory.');
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not remove that contact.', 'bad');
    } finally {
      setRemovingId(null);
    }
  };

  const groups = useMemo(() => groupByCompany(contacts, companies), [contacts, companies]);
  const qq = q.trim().toLowerCase();
  const shown = useMemo<DirGroup[]>(() => {
    if (!qq) return groups;
    const hit = (v: unknown) => String(v || '').toLowerCase().includes(qq);
    return groups
      .map((g) => (hit(g.name) || hit(g.trade) ? g : { ...g, people: g.people.filter((p) => hit(p.name) || hit(p.role) || hit(p.email) || hit(p.phone)) }))
      .filter((g) => g.people.length > 0 || hit(g.name) || hit(g.trade));
  }, [groups, qq]);

  const people = groups.reduce((n, g) => n + g.people.length, 0);
  const named = groups.filter((g) => g.name);
  const subCount = groups.filter((g) => g.isSub).length;
  const trades = new Set(groups.map((g) => g.trade).filter(Boolean)).size;
  const stats: StatItem[] = [
    { label: 'Companies', value: named.length, sub: subCount ? `${subCount} sub${subCount === 1 ? '' : 's'} on the job` : undefined, icon: <Buildings size={15} /> },
    { label: 'People', value: people, icon: <UsersThree size={15} /> },
    ...(trades ? [{ label: 'Trades', value: trades, icon: <Wrench size={15} /> }] : []),
  ];

  let body: React.ReactNode;
  if (loading && contacts.length === 0 && companies.length === 0) {
    body = <div className="dirMsg" aria-busy="true">Loading the directory…</div>;
  } else if (loadError && contacts.length === 0 && companies.length === 0) {
    body = <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the directory" text={loadError} action={<Button icon={<ArrowClockwise size={15} />} onClick={() => void load()}>Try Again</Button>} />;
  } else if (groups.length === 0) {
    body = <EmptyState icon={<UsersThree size={22} />} title="Nobody on this job yet" text="The owner and architect land here when a project is created with them." action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openAdd()}>Add Someone</Button>} />;
  } else if (shown.length === 0) {
    body = <EmptyState icon={<UsersThree size={22} />} title="No one matches that search" action={<Button onClick={() => setQ('')}>Clear Search</Button>} />;
  } else if (view === 'list') {
    /* List: one row per person with the shared list tools (columns, filters,
       saved views, export, bulk remove through the row's own route). */
    type PersonRow = DirContact & { rowKey: string; companyName: string };
    const rows: PersonRow[] = shown.flatMap((g) => g.people.map((p, i) => ({ ...p, rowKey: p.id || `${g.key}:${i}`, companyName: g.name || p.company || '' })));
    const cols: Column<PersonRow>[] = [
      { key: 'name', header: 'Name', primary: true, render: (p) => <span className="dirTName"><Avatar name={p.name} src={p.avatar_url} size={28} />{p.name}</span> },
      { key: 'role', header: 'Role', phone: 'show' },
      { key: 'companyName', header: 'Company', phone: 'show' },
      { key: 'trade', header: 'Trade' },
      { key: 'email', header: 'Email', groupable: false, filterable: false, render: (p) => (p.email ? <a className="k-link" href={mailHref(p.email) ?? undefined} onClick={(e) => e.stopPropagation()}>{p.email}</a> : '') },
      { key: 'phone', header: 'Phone', groupable: false, filterable: false, render: (p) => (p.phone ? <a className="k-link" href={telHref(p.phone) ?? undefined} onClick={(e) => e.stopPropagation()}>{p.phone}</a> : '') },
    ];
    body = (
      <DataTable<PersonRow>
        tableId="project-directory"
        exportName="directory"
        columns={cols}
        rows={rows}
        rowKey={(p) => p.rowKey}
        onRowClick={(p) => { if (p.id) openEdit(p); }}
        rowActions={(p) => (p.id ? [
          { label: 'Edit', icon: <PencilSimple size={15} />, onClick: () => openEdit(p) },
          { label: removingId === p.id ? 'Removing…' : 'Remove', icon: <Trash size={15} />, onClick: () => void remove(p), tone: 'danger', disabled: removingId === p.id },
        ] : [])}
        bulkEdit={{
          noun: 'contact',
          allowed: rights.edit,
          remove: {
            allowed: rights.edit,
            label: 'Remove',
            verb: 'removed',
            // People listed from a sub's company record are edited on that company, not here.
            apply: (p) => (p.id
              ? jsonRequest(`/api/projects/${projectId}/directory/${p.id}`, 'DELETE')
              : Promise.resolve(new Response(JSON.stringify({ error: `${p.name} comes from the ${p.companyName || 'sub'} company record — change it there.` }), { status: 409 }))),
          },
          onDone: () => { void load(); },
        }}
      />
    );
  } else {
    body = (
      <div className="dirGroups">
        {shown.map((g) => (
          <CompanyGroup key={g.key} g={g} view={view} onAdd={openAdd} onEdit={openEdit} onRemove={remove} removingId={removingId} />
        ))}
      </div>
    );
  }

  return (
    <div className="dirWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Projects', href: '/app/projects' }, { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` }, { label: 'Directory' }]}
        title="Directory"
        subtitle={ctx?.project?.name || undefined}
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openAdd()}>Add Someone</Button>}
      >
        {!loading && <StatRow items={stats} />}
        {loadError && (contacts.length > 0 || companies.length > 0) && <p role="alert" className="dirErr">{loadError}</p>}
        {groups.length > 0 && (
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder="Search people, companies, trades…"
            actions={
              <span className="dirViews" role="group" aria-label="Layout">
                <button type="button" className="k-chip" aria-pressed={view === 'grid'} onClick={() => pickView('grid')}><SquaresFour size={15} /> Grid</button>
                <button type="button" className="k-chip" aria-pressed={view === 'list'} onClick={() => pickView('list')}><Rows size={15} /> List</button>
              </span>
            }
          />
        )}
        {body}
      </PageShell>

      <FormModal
        open={open}
        onClose={close}
        title={editingId ? 'Edit Contact' : 'Add to the Directory'}
        subtitle={ctx?.project?.name || undefined}
        onSubmit={save}
        submitLabel={editingId ? 'Save Changes' : 'Add to Directory'}
        busy={saving}
        error={formError || null}
      >
        <FormGrid cols={2}>
          <Field label="Name" required>
            <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Role">
            <Suggest className="k-input" value={draft.role ?? ''} onChange={(e) => setDraft({ ...draft, role: e.target.value })} options={ROLES} placeholder="Pick or type a role" />
          </Field>
          <Field label="Company">
            <Suggest className="k-input" value={draft.company ?? ''} onChange={(e) => setDraft({ ...draft, company: e.target.value })} options={named.map((g) => g.name)} placeholder="Pick or type a company" />
          </Field>
          <Field label="Email">
            <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input type="tel" inputMode="tel" autoComplete="off" value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
        </FormGrid>
      </FormModal>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}

function QuickLinks({ phone, email, who }: { phone?: string | null; email?: string | null; who: string }) {
  const tel = telHref(phone); const mail = mailHref(email);
  if (!tel && !mail) return null;
  return (
    <span className="dirQuick">
      {tel && <Button size="sm" variant="ghost" icon={<Phone size={16} weight="bold" />} href={tel} aria-label={`Call ${who}`} title={`Call ${phone}`} />}
      {mail && <Button size="sm" variant="ghost" icon={<EnvelopeSimple size={16} weight="bold" />} href={mail} aria-label={`Email ${who}`} title={`Email ${email}`} />}
    </span>
  );
}

function CompanyGroup({ g, view, onAdd, onEdit, onRemove, removingId }: {
  g: DirGroup; view: View;
  onAdd: (company?: string) => void; onEdit: (c: DirContact) => void; onRemove: (c: DirContact) => void; removingId: string | null;
}) {
  const title = g.name || 'No company';
  return (
    <section className="dirCo" aria-label={title}>
      <header className="dirCoHead">
        {g.name ? <CompanyMark name={g.name} size={44} /> : <Avatar name="" mark="—" size={44} shape="tile" tone="var(--text-tertiary)" />}
        <div className="dirCoText">
          <h2 className="dirCoName">{title}</h2>
          <span className="dirCoMeta">
            {g.trade && <Badge tone="neutral">{g.trade}</Badge>}
            {g.isSub && <Badge tone="ongoing">Sub on this job</Badge>}
            <span className="dirCount">{g.people.length} {g.people.length === 1 ? 'person' : 'people'}</span>
          </span>
        </div>
        <QuickLinks phone={g.phone} email={g.email} who={title} />
        {g.name && <Button size="sm" variant="ghost" icon={<Plus size={15} weight="bold" />} onClick={() => onAdd(g.name)} aria-label={`Add someone at ${g.name}`} title={`Add someone at ${g.name}`} />}
      </header>
      {g.people.length > 0 && (
        <ul className="dirPeople" data-view={view}>
          {g.people.map((p, i) => (
            <li key={p.id ?? `${g.key}-${p.name}-${i}`} className="dirPerson">
              <Avatar name={p.name} src={p.avatar_url} size={view === 'grid' ? 48 : 36} />
              <div className="dirPText">
                <span className="dirPName">{p.name}</span>
                {p.role && <span className="dirPRole">{p.role}</span>}
                {view === 'list' && (p.phone || p.email) && <span className="dirPContact">{[p.phone, p.email].filter(Boolean).join(' · ')}</span>}
              </div>
              <span className="dirPActions">
                <QuickLinks phone={p.phone} email={p.email} who={p.name} />
                {p.id && (
                  <RowActions actions={[
                    { label: 'Edit', icon: <PencilSimple size={15} />, onClick: () => onEdit(p) },
                    { label: removingId === p.id ? 'Removing…' : 'Remove', icon: <Trash size={15} />, onClick: () => onRemove(p), tone: 'danger', disabled: removingId === p.id },
                  ]} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CSS = `
.dirWs > .k-page { max-width: none; }
.dirMsg { color: var(--text-secondary); font-size: var(--fs-md); padding: 16px 0; }
.dirErr { color: var(--danger); font-size: var(--fs-md); margin: 0; }
.dirViews { display: inline-flex; gap: 6px; }
.dirGroups { display: flex; flex-direction: column; }
.dirCo { padding: 20px 0; border-top: 1px solid var(--border-subtle); min-width: 0; }
.dirCo:first-child { border-top: 0; padding-top: 4px; }
.dirCoHead { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dirCoText { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 auto; }
.dirCo .dirCoName { margin: 0; font-size: var(--fs-lg); font-weight: 800; color: var(--text-primary); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirCoMeta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.dirCount { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); }
.dirQuick { display: inline-flex; gap: 2px; flex-shrink: 0; }
.dirPeople { list-style: none; margin: 14px 0 0; padding: 0; min-width: 0; }
.dirPeople[data-view="grid"] { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 6px 20px; padding-left: 56px; }
.dirPeople[data-view="list"] { display: flex; flex-direction: column; padding-left: 56px; }
.dirPerson { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 8px 0; }
.dirPeople[data-view="list"] .dirPerson + .dirPerson { border-top: 1px solid var(--border-subtle); }
.dirPText { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.dirPName { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirPRole { font-size: var(--fs-sm); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirPContact { font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirPActions { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
.dirTName { display: inline-flex; align-items: center; gap: 10px; }
@media (max-width: 640px) {
  .dirWs .k-btn, .dirWs .k-chip, .dirWs .k-input { min-height: 44px; }
  .dirWs .k-icon-btn { min-width: 44px; }
  .dirPeople[data-view="grid"], .dirPeople[data-view="list"] { padding-left: 0; }
  .dirCoHead { flex-wrap: wrap; }
  .dirCoText { flex-basis: calc(100% - 60px); }
  .dirCoHead > .dirQuick { margin-left: 56px; }
}
`;
