'use client';
/**
 * Who owns this job — "Assigned to" (a signed-in team member) and the
 * customer it belongs to. Saves through PATCH /api/projects/[projectId].
 *
 * Exists because there was no direct way to hand an existing job to a
 * salesperson or PM: Work Assignments stayed locked until an emailed invite was
 * accepted, Customers → Assign only worked for customer-linked jobs, and the
 * Team page pointed at a "Project Settings" page that does not exist.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Field, Select, Input, Button, FormGrid, Toast, useToast } from '@/components/ui/kit';
import { getAuthHeaders } from '@/lib/supabase-browser';

type TeamUser = { id: string; name: string; email: string };
type Customer = { id: string; name: string; email: string };

export type OwnershipProject = {
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  customer_id?: string | null;
};

export default function ProjectOwnershipCard({
  projectId,
  project,
  onSaved,
}: {
  projectId: string;
  project: OwnershipProject;
  onSaved?: (project: Record<string, unknown>) => void;
}) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [assignee, setAssignee] = useState(project.assigned_to ?? '');
  const [customer, setCustomer] = useState(project.customer_id ?? '');
  const [saving, setSaving] = useState<'assignee' | 'customer' | null>(null);
  const { toast, show } = useToast();
  /* "No customers yet — add one" linked to /app/customers, which has no way to
     add one: a dead end, and a Customer field nobody could fill. The customer
     is now created right here and linked to the job in one step. */
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addErr, setAddErr] = useState<{ text: string; field?: 'name' | 'email' } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { setAssignee(project.assigned_to ?? ''); }, [project.assigned_to]);
  useEffect(() => { setCustomer(project.customer_id ?? ''); }, [project.customer_id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const auth = await getAuthHeaders();
        const [u, c] = await Promise.all([
          fetch('/api/team/users', { headers: auth }),
          fetch('/api/customers/profiles?limit=500', { headers: auth }),
        ]);
        const uj = u.ok ? await u.json() : null;
        const cj = c.ok ? await c.json() : null;
        if (!alive) return;
        setUsers(((uj?.users ?? []) as TeamUser[]).map((x) => ({ id: x.id, name: x.name, email: x.email })));
        setCustomers(((cj?.customers ?? []) as Customer[]).map((x) => ({ id: x.id, name: x.name, email: x.email })));
        if (!u.ok || !c.ok) setLoadErr("Couldn't load every option — refresh to try again.");
      } catch (err) {
        console.error('[ProjectOwnershipCard] load', err);
        if (alive) { setUsers([]); setCustomers([]); setLoadErr("Couldn't load your team and customers — refresh to try again."); }
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save(kind: 'assignee' | 'customer', value: string) {
    setSaving(kind);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(kind === 'assignee' ? { assignedTo: value || null } : { customerId: value || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not save the change');
      if (kind === 'assignee') {
        show(value ? `Assigned to ${body.assigneeName || 'team member'} — they've been notified in the app.` : 'Assignment cleared.');
      } else {
        show(value ? 'Customer linked to this job.' : 'Customer unlinked.');
      }
      onSaved?.(body.project ?? {});
    } catch (err) {
      console.error('[ProjectOwnershipCard] save', err);
      // Roll the select back to what is actually saved.
      if (kind === 'assignee') setAssignee(project.assigned_to ?? '');
      else setCustomer(project.customer_id ?? '');
      show(err instanceof Error ? err.message : 'Could not save the change', 'bad');
    } finally {
      setSaving(null);
    }
  }

  async function createCustomer() {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name) { setAddErr({ text: 'Enter the customer’s name.', field: 'name' }); document.getElementById('own-new-customer-name')?.focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAddErr({ text: 'That email doesn’t look right — fix it or leave it blank.', field: 'email' }); document.getElementById('own-new-customer-email')?.focus(); return; }
    setAddErr(null);
    setCreating(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch('/api/customers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ name, email: email || null, status: 'customer', source: 'Direct' }),
      });
      const body = await res.json().catch(() => ({}));
      const made = body?.customer as { id?: string; name?: string; email?: string } | undefined;
      if (!res.ok || !made?.id) throw new Error(body?.error || 'Could not add the customer');
      setCustomers((prev) => [{ id: made.id as string, name: made.name || name, email: made.email || email }, ...(prev ?? [])]);
      setCustomer(made.id);
      setAdding(false); setNewName(''); setNewEmail('');
      await save('customer', made.id);
    } catch (err) {
      console.error('[ProjectOwnershipCard] create customer', err);
      setAddErr({ text: err instanceof Error && err.message ? err.message : 'Could not add the customer. Please try again.' });
    } finally {
      setCreating(false);
    }
  }

  const userOptions = (users ?? []).map((u) => ({ value: u.id, label: u.email && u.name !== u.email ? `${u.name} — ${u.email}` : u.name }));
  // Keep a saved assignee visible even if they're no longer in the roster list.
  if (project.assigned_to && users && !users.some((u) => u.id === project.assigned_to)) {
    userOptions.unshift({ value: project.assigned_to, label: project.assigned_to_name || 'Former team member' });
  }
  const customerOptions = (customers ?? []).map((c) => ({ value: c.id, label: c.email ? `${c.name || 'Unnamed'} — ${c.email}` : (c.name || 'Unnamed') }));
  if (project.customer_id && customers && !customers.some((c) => c.id === project.customer_id)) {
    customerOptions.unshift({ value: project.customer_id, label: 'Linked Customer' });
  }
  const linked = project.customer_id ? (customers ?? []).find((c) => c.id === project.customer_id) : undefined;

  return (
    <Card title="Ownership" subtitle="Who runs this job, and whose job it is">
      {/* 44px buttons on a phone (kit's small button is 30px). */}
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 767px) { .pocRoot .k-btn { min-height: 44px; } }' }} />
      <div className="pocRoot">
      <FormGrid cols={2}>
        <Field
          label="Assigned To"
          hint={users && users.length === 0 ? <>No team members yet — <Link href="/app/people?tab=access">invite your team</Link>.</> : 'Anyone who can sign in. They get it in My Work and a notification.'}
        >
          <Select
            value={assignee}
            disabled={users === null || saving === 'assignee'}
            placeholder={users === null ? 'Loading team…' : 'Unassigned'}
            options={userOptions}
            onChange={(e) => { setAssignee(e.target.value); void save('assignee', e.target.value); }}
          />
        </Field>
        <Field
          label="Customer"
          hint={customers && customers.length === 0 ? 'No customers yet — add the first one below.' : project.customer_id ? 'Billing and the owner portal follow this customer.' : 'Link the customer this job is for.'}
        >
          <Select
            value={customer}
            disabled={customers === null || saving === 'customer'}
            placeholder={customers === null ? 'Loading customers…' : 'No customer linked'}
            options={customerOptions}
            onChange={(e) => { setCustomer(e.target.value); void save('customer', e.target.value); }}
          />
        </Field>
      </FormGrid>
      {customers !== null && (adding ? (
        /* A real form: the keyboard's Go/Enter adds the customer, like the button. */
        <form style={{ marginTop: 12 }} aria-label="New customer" noValidate onSubmit={(e) => { e.preventDefault(); void createCustomer(); }}>
          <FormGrid cols={2}>
            <Field label="Customer Name" required error={addErr?.field === 'name' ? addErr.text : null}>
              <Input id="own-new-customer-name" value={newName} onChange={(e) => { setNewName(e.target.value); setAddErr(null); }} placeholder="Owner or company name" autoComplete="organization" />
            </Field>
            <Field label="Email" hint="Optional — used for the owner portal." error={addErr?.field === 'email' ? addErr.text : null}>
              <Input id="own-new-customer-email" type="email" inputMode="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setAddErr(null); }} placeholder="owner@company.com" />
            </Field>
          </FormGrid>
          {addErr && !addErr.field && <div className="k-error" role="alert" style={{ marginTop: 8 }}>{addErr.text}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button variant="primary" type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add Customer'}</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setAddErr(null); }} disabled={creating}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" onClick={() => { setAdding(true); window.setTimeout(() => document.getElementById('own-new-customer-name')?.focus(), 0); }}>New Customer</Button>
        </div>
      ))}
      {loadErr && <div className="k-hint" style={{ marginTop: 8 }}>{loadErr}</div>}
      {/* The linked customer opens their own record — "Open Customers" went to
          the whole list, so the customer chosen here could not be reached from it. */}
      {project.customer_id && (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="ghost" href={`/app/customers?customer=${encodeURIComponent(project.customer_id)}`}>
            Open {linked?.name || 'Customer'}
          </Button>
        </div>
      )}
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </Card>
  );
}
