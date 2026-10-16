'use client';
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DataTable, FormModal, FormGrid, Field, Input, Select, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import { useProjects } from '@/lib/hooks/useProjects';
import UserPicker from '@/components/UserPicker';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { UsersThree, WarningCircle, Buildings, CurrencyDollar, Target, CalendarBlank, Robot, Clipboard, CheckCircle, XCircle, Hourglass, House, Cactus, ArrowLeft, Gauge, MapPin, Lightning, Package, DownloadSimple, Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { useToast } from '@/components/Toast';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useEscapeClose } from '@/lib/ui/use-escape-close';
import { confirmDialog } from '@/lib/ui/async-dialog';

/* ─── Palette ─── */
const BG = 'var(--bg-base)', CARD = 'var(--bg-surface)', GOLD = 'var(--brand-primary)', GREEN = 'var(--success)';
const BORDER = 'rgba(255,255,255,0.12)', TEXT = 'var(--text-primary)', DIM = 'var(--text-secondary)', DARK = 'var(--bg-base)';
const RED = 'var(--danger)', AMBER = 'var(--warning)', BLUE = 'var(--brand-primary)', PURPLE = 'var(--warning)';
/* Colors are CSS vars now, so a hex alpha suffix no longer works — tint with color-mix. */
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/* ─── Types ─── */
type CustomerStatus = 'lead' | 'qualified' | 'proposal' | 'customer' | 'lost';
type Customer = {
  id: string; name: string; email: string; phone: string; state: string;
  city: string; zip_code: string; country: string; climate_zone: string; utility_rate: number;
  status: CustomerStatus; lead_score: number; source: string;
  created_at: string; updated_at: string;
  discovery_answers?: Record<string, string>;
  recommendations?: { id: string; title: string; status: 'accepted' | 'rejected' | 'pending' }[];
  design_sessions?: { id: string; room: string; style: string; date: string }[];
  material_selections?: { name: string; qty: number; cost: number }[];
  conversations?: { date: string; preview: string }[];
  score_breakdown?: { engagement: number; budget: number; timeline: number; fit: number };
};

const STATUS_COLORS: Record<CustomerStatus, string> = {
  lead: BLUE, qualified: AMBER, proposal: GOLD, customer: GREEN, lost: RED,
};
const STATUSES: CustomerStatus[] = ['lead', 'qualified', 'proposal', 'customer', 'lost'];
const SOURCES = ['Website', 'Design Studio', 'Referral', 'Social Media', 'Sage Chat', 'ROI Calculator', 'Direct'];

/* Every state for the New Customer form — the filter list above only carries
   the states the pipeline has historically held. */
const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The New / Edit Customer form. Keys are the customer_profiles columns
   POST /api/customers/profiles and PATCH /api/customers/:id accept, so the
   body is the draft as typed and a reload brings back exactly these fields. */
type NewCustomerDraft = {
  name: string; email: string; phone: string; city: string; state: string; zip_code: string;
  status: CustomerStatus; source: string;
};
const EMPTY_DRAFT: NewCustomerDraft = {
  name: '', email: '', phone: '', city: '', state: '', zip_code: '', status: 'customer', source: 'Direct',
};

/* POST returns the raw customer_profiles row; the list reads the shape GET
   maps it to (score → lead_score, utility_cost_kwh → utility_rate). Same
   mapping, so the row added on screen is the row a reload brings back. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromProfileRow(c: any): Customer {
  return {
    id: String(c.id),
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    state: c.state || '',
    city: c.city || '',
    zip_code: c.zip_code || '',
    country: c.country || '',
    climate_zone: c.climate_zone || '',
    utility_rate: c.utility_cost_kwh != null ? Number(c.utility_cost_kwh) : 0,
    status: (c.status || 'lead') as CustomerStatus,
    lead_score: c.score != null ? Number(c.score) : 0,
    source: c.source || '',
    created_at: c.created_at || new Date().toISOString(),
    updated_at: c.updated_at || c.created_at || new Date().toISOString(),
  };
}

/* ─── Helpers ─── */
const fmt = (n: number | string | null | undefined) => '$' + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function CustomersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const custRights = useEditRights('Sales');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { projects: liveProjects, revalidate: revalidateProjects } = useProjects();
  const projects = liveProjects as any[];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // Team member chosen in the Actions panel to own the new/linked project.
  // Composite: '' | 'user:<id>' | 'sub:<id>' — the picker spans team + subs.
  const [assignee, setAssignee] = useState('');
  // Compose-and-send email (via Resend) straight from the customer record.
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  // Escape closes the email window (not while it is sending).
  const emailDialogRef = useRef<HTMLDivElement>(null);
  const emailSendingRef = useRef(false);
  emailSendingRef.current = emailSending;
  const closeEmail = useCallback(() => { if (!emailSendingRef.current) setEmailOpen(false); }, []);
  useEscapeClose(emailDialogRef, closeEmail, emailOpen);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'discovery' | 'recommendations' | 'designs' | 'materials' | 'conversations'>('overview');
  // New Customer form.
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ name?: string; email?: string }>({});
  const [draft, setDraft] = useState<NewCustomerDraft>(EMPTY_DRAFT);
  // The customer just added: listed newest-first and highlighted so it is
  // the first thing on screen, not somewhere under a lead-score sort.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Set while the form edits an existing customer instead of adding one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* The open customer rides the URL (?customer=<id>): a reload, a shared link
     or the phone's Back gesture lands where you were. It used to live only in
     this component — a reload dropped you on the list and Back left the page. */
  const pendingOpen = useRef<string | null>(null);
  useEffect(() => {
    try { pendingOpen.current = new URLSearchParams(window.location.search).get('customer'); } catch { /* no URL */ }
    const onPop = () => {
      let id: string | null = null;
      try { id = new URLSearchParams(window.location.search).get('customer'); } catch { /* no URL */ }
      if (!id) setSelected(null);
      else pendingOpen.current = id;
      setCustomersTick((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [customersTick, setCustomersTick] = useState(0);
  const openCustomer = useCallback((c: Customer) => {
    setSelected(c);
    setDetailTab('overview');
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('customer') !== c.id) {
        u.searchParams.set('customer', c.id);
        window.history.pushState(null, '', `${u.pathname}${u.search}${u.hash}`);
      }
    } catch { /* URL sync is a convenience */ }
  }, []);
  const closeCustomer = useCallback(() => {
    setSelected(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('customer')) {
        u.searchParams.delete('customer');
        window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
      }
    } catch { /* URL sync is a convenience */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/customers/profiles');
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setCustomers(Array.isArray(data?.customers) ? data.customers : []);
    } catch {
      setError(true);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Live project rollup — project counts + lifetime contract value per
  // customer — reads the shared projects cache above.

  useEffect(() => {
    load();
  }, [load]);

  // Open the customer named in the URL once the list has it.
  useEffect(() => {
    const id = pendingOpen.current;
    if (!id || !customers.length) return;
    const c = customers.find((x) => x.id === id);
    if (c) { setSelected(c); setDetailTab('overview'); }
    pendingOpen.current = null;
  }, [customers, customersTick]);

  // Clear the chosen assignee when the open profile changes — the picker
  // belongs to the customer currently in view, not the last one.
  useEffect(() => {
    setAssignee('');
  }, [selected?.id]);

  const filtered = useMemo(() => {
    let list = customers;
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    if (filterSource !== 'all') list = list.filter(c => c.source === filterSource);
    if (filterState !== 'all') list = list.filter(c => c.state === filterState);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [customers, filterStatus, filterSource, filterState, search]);

  const exportCSV = useCallback(() => {
    const headers = ['Name', 'Email', 'Phone', 'State', 'City', 'Status', 'Lead Score', 'Source', 'Created'];
    const rows = filtered.map(c => [
      c.name, c.email, c.phone, c.state, c.city, c.status, c.lead_score, c.source, c.created_at,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `saguaro_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    STATUSES.forEach(s => { counts[s] = customers.filter(c => c.status === s).length; });
    return counts;
  }, [customers]);

  // Portfolio KPI: average lead score across all profiles (derived, presentational)
  const avgScore = useMemo(() => {
    if (!customers.length) return 0;
    return Math.round(customers.reduce((s, c) => s + (Number(c.lead_score) || 0), 0) / customers.length);
  }, [customers]);

  /* Per-customer project rollup: count + lifetime contract value.
     projects.customer_id is the real link and it wins outright. The email,
     owner-name and "<Name> Project" matching below is NOT dead code — it is
     how every project created before that column existed still finds its
     customer, and those rows will never be backfilled beyond the ones whose
     owner_email matched exactly.
     The order matters in both directions. A project that IS linked belongs to
     that customer and to nobody else, so it returns false for everyone else
     rather than falling through to the fuzzy checks — otherwise a linked job
     could still be claimed by a second customer with a similar name, which is
     the failure the link was added to stop.
     DB numerics can round-trip as strings — always Number() before math. */
  const projectRollup = useMemo(() => {
    const map = new Map<string, { count: number; value: number; list: { id: string; name: string; status?: string; value: number }[] }>();
    customers.forEach(c => {
      const email = (c.email || '').trim().toLowerCase();
      const name = (c.name || '').trim().toLowerCase();
      const list = projects
        .filter((p: any) => {
          const linked = String(p?.customer_id || '').trim();
          if (linked) return linked === c.id;
          const pEmail = String(p?.owner_email || '').trim().toLowerCase();
          const pOwner = String(p?.owner_name || '').trim().toLowerCase();
          const pName = String(p?.name || '').trim().toLowerCase();
          if (email && pEmail && pEmail === email) return true;
          if (name && pOwner && pOwner === name) return true;
          if (name && (pName === `${name} project` || pName.startsWith(`${name} `))) return true;
          return false;
        })
        .map((p: any) => ({
          id: String(p?.id ?? ''),
          name: String(p?.name ?? 'Untitled'),
          status: p?.status ? String(p.status) : undefined,
          value: Number(p?.contract_value) || Number(p?.contract_amount) || Number(p?.original_contract) || 0,
        }));
      map.set(c.id, { count: list.length, value: list.reduce((s, p) => s + (Number(p.value) || 0), 0), list });
    });
    return map;
  }, [customers, projects]);

  const scoreColor = (s: number) => s >= 80 ? GREEN : s >= 50 ? AMBER : RED;
  const custColumns = useMemo<Column<Customer>[]>(() => [
    { key: 'name', header: 'Name', primary: true, phone: 'show', accessor: c => c.name,
      render: c => (
        <span className="k-name">
          <span className="k-avatar" aria-hidden>{(c.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')}</span>
          <span className="k-name-text"><span>{c.name}</span><span>{c.email}</span></span>
        </span>
      ) },
    { key: 'state', header: 'State', phone: 'hide', accessor: c => c.state, render: c => <span style={{ fontWeight: 600 }}>{c.state}</span> },
    { key: 'status', header: 'Status', phone: 'show', accessor: c => c.status, render: c => <StatusPill module="customers" status={c.status} size="sm" /> },
    { key: 'lead_score', header: 'Score', phone: 'show', accessor: c => Number(c.lead_score) || 0, render: c => <span style={{ fontWeight: 800, color: scoreColor(c.lead_score) }}>{c.lead_score}</span> },
    { key: 'projects', header: 'Projects', phone: 'hide', accessor: c => projectRollup.get(c.id)?.count || 0, render: c => { const n = projectRollup.get(c.id)?.count || 0; return <span style={{ color: n > 0 ? TEXT : DIM, fontWeight: 600 }}>{n}</span>; } },
    { key: 'ltv', header: 'Lifetime Value', align: 'right', phone: 'show', accessor: c => (projectRollup.get(c.id)?.value || 0) > 0 ? projectRollup.get(c.id)?.value : null, render: c => { const v = projectRollup.get(c.id)?.value || 0; return v > 0 ? <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(v)}</span> : '—'; } },
    { key: 'source', header: 'Source', phone: 'hide', accessor: c => c.source, render: c => c.source || '—' },
    { key: 'created_at', header: 'Created', phone: 'hide', accessor: c => c.created_at, render: c => fmtDate(c.created_at) },
  ], [projectRollup]);

  // Portfolio lifetime value across every customer with matched projects.
  const lifetimeTotals = useMemo(() => {
    let value = 0, withProjects = 0;
    projectRollup.forEach(r => { value += Number(r.value) || 0; if (r.count > 0) withProjects++; });
    return { value, withProjects };
  }, [projectRollup]);


  /* ─── New Customer ───
     The page listed customers and had no way to add one; the only create path
     was buried in a project's Ownership card. Same endpoint, same fields that
     route accepts, so a customer added here is the same record either way. */
  const openAdd = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setAddErr(null);
    setFieldErr({});
    setAddOpen(true);
  }, []);

  const openEdit = useCallback((c: Customer) => {
    setEditingId(c.id);
    setDraft({
      name: c.name || '', email: c.email || '', phone: c.phone || '', city: c.city || '',
      state: c.state || '', zip_code: c.zip_code || '',
      status: (STATUSES.includes(c.status) ? c.status : 'lead') as CustomerStatus,
      source: c.source || 'Direct',
    });
    setAddErr(null);
    setFieldErr({});
    setAddOpen(true);
  }, []);

  const setDraftField = <K extends keyof NewCustomerDraft>(k: K, v: NewCustomerDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k === 'name' || k === 'email') setFieldErr((f) => ({ ...f, [k]: undefined }));
  };

  const createCustomer = useCallback(async () => {
    if (addBusy) return;
    const name = draft.name.trim();
    const email = draft.email.trim();
    const errs: { name?: string; email?: string } = {};
    if (!name) errs.name = 'Enter the customer’s name.';
    if (email && !EMAIL_RE.test(email)) errs.email = 'That email doesn’t look right — fix it or leave it blank.';
    if (errs.name || errs.email) {
      setFieldErr(errs);
      document.getElementById(errs.name ? 'new-customer-name' : 'new-customer-email')?.focus();
      return;
    }
    setFieldErr({});
    setAddErr(null);
    setAddBusy(true);
    if (editingId) {
      try {
        // Every field as it stands, blanks included: clearing a phone clears it.
        const payload: Record<string, string> = { name, status: draft.status, source: draft.source };
        (['email', 'phone', 'city', 'state', 'zip_code'] as const).forEach((k) => { payload[k] = draft[k].trim(); });
        const auth = await getAuthHeaders();
        const res = await fetch(`/api/customers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        const saved = (body as { customer?: { id?: string } }).customer;
        if (!res.ok || !saved?.id) {
          const msg = typeof body?.error === 'string' ? body.error : 'Couldn’t save the customer. Please try again.';
          throw new Error(typeof body?.ref === 'string' ? `${msg} (ref ${body.ref})` : msg);
        }
        const row = fromProfileRow(saved);
        setCustomers((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
        setSelected((cur) => (cur && cur.id === row.id ? { ...cur, ...row } : cur));
        setAddOpen(false);
        setEditingId(null);
        showToast(`${row.name || 'Customer'} saved.`, 'success');
      } catch (err) {
        console.error('[customers] save', err);
        setAddErr(err instanceof Error && err.message ? err.message : 'Couldn’t save the customer. Please try again.');
      } finally {
        setAddBusy(false);
      }
      return;
    }
    try {
      const payload: Record<string, string> = { name, status: draft.status, source: draft.source };
      (['email', 'phone', 'city', 'state', 'zip_code'] as const).forEach((k) => {
        const v = draft[k].trim();
        if (v) payload[k] = v;
      });
      const auth = await getAuthHeaders();
      const res = await fetch('/api/customers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const made = (body as { customer?: { id?: string } }).customer;
      if (!res.ok || !made?.id) {
        const msg = typeof body?.error === 'string' ? body.error : 'Couldn’t add the customer. Please try again.';
        throw new Error(typeof body?.ref === 'string' ? `${msg} (ref ${body.ref})` : msg);
      }
      const row = fromProfileRow(made);
      setCustomers((prev) => [row, ...prev.filter((c) => c.id !== row.id)]);
      // Clear only the filters that would hide the new row.
      if (filterStatus !== 'all' && filterStatus !== row.status) setFilterStatus('all');
      if (filterSource !== 'all' && filterSource !== row.source) setFilterSource('all');
      if (filterState !== 'all' && filterState !== row.state) setFilterState('all');
      if (search) {
        const q = search.toLowerCase();
        if (!row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) setSearch('');
      }
      setJustAdded(row.id);
      setAddOpen(false);
      showToast(`${row.name || 'Customer'} added to your customers.`, 'success');
    } catch (err) {
      console.error('[customers] create', err);
      setAddErr(err instanceof Error && err.message ? err.message : 'Couldn’t add the customer. Please try again.');
    } finally {
      setAddBusy(false);
    }
  }, [addBusy, draft, editingId, filterStatus, filterSource, filterState, search, showToast]);

  /* Delete the open customer. Their discovery answers, recommendations and
     material picks go with them; linked projects stay and just lose the link. */
  const deleteCustomer = useCallback(async (c: Customer) => {
    if (deleting) return;
    const ok = await confirmDialog({
      title: 'Delete this customer?',
      message: `Delete ${c.name || 'this customer'}? Their discovery answers and recommendations go with them. Projects stay — they just lose the link.`,
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`/api/customers/${c.id}`, { method: 'DELETE', headers: auth });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Couldn’t delete the customer. Please try again.');
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      closeCustomer();
      showToast(`${c.name || 'Customer'} deleted.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t delete the customer. Please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleting, closeCustomer, showToast]);

  /* ─── Assign customer to a project (idempotent) + route a team member ───
     The old handler POSTed straight to /api/projects/create, which ALWAYS
     inserts a row — so every click forked another "<Name> Project" for the
     same customer, and the success toast fired each time. It also never opened
     the project and could not assign it to anyone.

     /api/projects/assign reuses the customer's existing project when one is
     already linked and only creates when there is none, records the chosen
     team member as the project's assignee (project list + document access via
     the role model), surfaces real server errors, and we navigate to the job
     on success. */
  const assignToProject = useCallback(async (c: Customer) => {
    if (assigning) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/projects/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: c.id,
          name: `${c.name} Project`,
          ...(assignee.startsWith('user:')
            ? { assigneeUserId: assignee.slice(5) }
            : assignee.startsWith('sub:')
            ? { assigneeSubId: assignee.slice(4) }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Request failed: ${res.status}`);
      }

      const verb = data?.reused ? 'Opened existing project for' : 'Project created for';
      const suffix = data?.assigned && data?.assigneeName ? ` · assigned to ${data.assigneeName}` : '';
      showToast(`${verb} ${c.name}${suffix}`, 'success');

      await load();
      revalidateProjects();

      // Take the owner straight to the job they just created/linked.
      if (data?.projectId) router.push(`/app/projects/${data.projectId}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not assign to a project. Please try again.', 'error');
    } finally {
      setAssigning(false);
    }
  }, [assigning, assignee, load, revalidateProjects, router, showToast]);

  /* Send an email to the customer through the CRM (Resend) and log it on the
     record. Honest: a 503 (email not configured) surfaces as an error and
     nothing is logged — no fake "sent". */
  const sendCustomerEmail = useCallback(async (customerId: string) => {
    if (emailSending) return;
    if (!emailSubject.trim() || !emailMessage.trim()) {
      showToast('Add a subject and a message first.', 'error');
      return;
    }
    setEmailSending(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Request failed: ${res.status}`);
      showToast('Email sent.', 'success');
      setEmailOpen(false);
      setEmailSubject('');
      setEmailMessage('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send that email.', 'error');
    } finally {
      setEmailSending(false);
    }
  }, [emailSending, emailSubject, emailMessage, showToast]);

  /* The New / Edit Customer form — the same fields both ways. */
  const customerForm = (
    <>
      {/* Portalled to <body>: PremiumSurface's content wrapper is a z-index:1
          stacking context, so a modal rendered inside it paints under the
          fixed top bar and the phone tab bar — which on a phone is exactly
          where this form's title and its Add Customer button sit. */}
      {addOpen && createPortal(<FormModal
        open={addOpen}
        onClose={() => { if (!addBusy) { setAddOpen(false); setEditingId(null); } }}
        title={editingId ? 'Edit Customer' : 'New Customer'}
        subtitle={editingId ? 'Change anything and save — the profile, the list and their projects all read the same record.' : 'Who you are building for. Link them to a job from their profile once they are saved.'}
        onSubmit={createCustomer}
        submitLabel={editingId ? 'Save Changes' : 'Add Customer'}
        busy={addBusy}
        error={addErr}
      >
        <FormGrid cols={2}>
          <Field label="Name" required error={fieldErr.name} span>
            <Input
              id="new-customer-name"
              value={draft.name}
              onChange={(e) => setDraftField('name', e.target.value)}
              autoComplete="name"
              maxLength={200}
              required
              aria-invalid={fieldErr.name ? true : undefined}
            />
          </Field>
          <Field label="Email" error={fieldErr.email}>
            <Input
              id="new-customer-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.email}
              onChange={(e) => setDraftField('email', e.target.value)}
              maxLength={200}
              aria-invalid={fieldErr.email ? true : undefined}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={draft.phone}
              onChange={(e) => setDraftField('phone', e.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="City">
            <Input
              autoComplete="address-level2"
              value={draft.city}
              onChange={(e) => setDraftField('city', e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="State">
            <Select
              value={draft.state}
              onChange={(e) => setDraftField('state', e.target.value)}
              options={US_STATES}
              placeholder="Choose a state"
              autoComplete="address-level1"
            />
          </Field>
          <Field label="ZIP">
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              value={draft.zip_code}
              onChange={(e) => setDraftField('zip_code', e.target.value)}
              maxLength={10}
            />
          </Field>
          <Field label="Status" hint="Lead, Qualified and Proposal count as pipeline.">
            <Select
              value={draft.status}
              onChange={(e) => setDraftField('status', e.target.value as CustomerStatus)}
              options={STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            />
          </Field>
          <Field label="Source">
            <Select
              value={draft.source}
              onChange={(e) => setDraftField('source', e.target.value)}
              options={SOURCES}
            />
          </Field>
        </FormGrid>
      </FormModal>, document.body)}
    </>
  );

  /* ─── Detail View ─── */
  if (selected) {
    const c = selected;
    // No breakdown on file is said as such — not drawn as four zero bars.
    const sb = c.score_breakdown || null;
    return (
      <PremiumSurface>
        {/* Back button */}
        <button onClick={closeCustomer} className="pmBtn" style={{ ...ghostButtonStyle, marginBottom: 20, minHeight: 44 }}>
          <ArrowLeft size={15} weight="bold" /> Back to Customers
        </button>

        {/* Identity Hero */}
        <ModuleHero
          eyebrow="Customer Profile"
          eyebrowIcon={<UsersThree size={13} weight="fill" color="var(--text-secondary)" />}
          title={c.name}
          subtitle={[c.email, c.phone].filter(Boolean).join(' · ') || 'No email or phone on file'}
          actions={
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openEdit(c)} className="pmBtn" style={{ ...goldOutlineButtonStyle, minHeight: 44 }}>
                <PencilSimple size={15} weight="bold" /> Edit
              </button>
              <button type="button" onClick={() => deleteCustomer(c)} disabled={deleting} className="pmBtn" style={{ ...ghostButtonStyle, minHeight: 44, color: RED }}>
                <Trash size={15} weight="bold" /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <div style={{
                padding: '4px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                background: mix(STATUS_COLORS[c.status], 13), color: STATUS_COLORS[c.status],
                border: `1px solid ${mix(STATUS_COLORS[c.status], 25)}`, textTransform: 'capitalize',
              }}>{c.status}</div>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: mix(scoreColor(c.lead_score), 8),
                border: `2px solid ${scoreColor(c.lead_score)}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: scoreColor(c.lead_score),
              }}>{c.lead_score}</div>
            </div>
          }
        />

        {/* Tabs */}
        <div role="tablist" aria-label="Customer details" style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {(['overview', 'discovery', 'recommendations', 'designs', 'materials', 'conversations'] as const).map(tab => (
            <button key={tab} type="button" role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)} className="pmBtn" style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${detailTab === tab ? GOLD : BORDER}`,
              background: detailTab === tab ? mix(GOLD, 9) : 'transparent',
              color: detailTab === tab ? GOLD : DIM,
              cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap',
              transition: 'background .15s ease, color .15s ease, border-color .15s ease',
            }}>{tab}</button>
          ))}
        </div>

        {customerForm}

        {/* Tab Content */}
        {detailTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {/* Geo Info */}
            <SectionCard flat title="Location & Geo" icon={<MapPin size={17} weight="duotone" color="var(--text-secondary)" />}>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  ['City', c.city || '—'],
                  ['State', c.state || '—'],
                  ['ZIP', c.zip_code || '—'],
                  ['Email', c.email || '—'],
                  ['Phone', c.phone || '—'],
                  ['Climate Zone', c.climate_zone || '—'],
                  ['Utility Rate', c.utility_rate ? `$${c.utility_rate}/kWh` : '—'],
                  ['Source', c.source || '—'],
                  ['Created', fmtDate(c.created_at)],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: DIM }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Lead Score Breakdown */}
            <SectionCard flat title="Lead Score Breakdown" icon={<Gauge size={17} weight="duotone" color="var(--text-secondary)" />}>
              {!sb && (
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
                  Lead score {c.lead_score}. No breakdown on file yet — it fills in as this customer answers discovery questions.
                </div>
              )}
              {sb && Object.entries(sb).map(([key, val]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, textTransform: 'capitalize', color: DIM }}>{key}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(val) }}>{val}%</span>
                  </div>
                  <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${val}%`, height: '100%', background: scoreColor(val),
                      borderRadius: 3, transition: 'width .5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </SectionCard>

            {/* Actions */}
            <SectionCard title="Actions" icon={<Lightning size={17} weight="duotone" color="var(--text-secondary)" />}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: DIM }}>
                    Assign to Team Member
                  </label>
                  <UserPicker
                    value={assignee}
                    onChange={setAssignee}
                    disabled={assigning}
                    unassignedLabel="Unassigned (link only)"
                  />
                </div>
                <button onClick={() => { assignToProject(c); }} disabled={assigning} className="pmBtn" style={{
                  ...goldButtonStyle, width: '100%',
                  cursor: assigning ? 'wait' : 'pointer', opacity: assigning ? 0.6 : 1,
                }}>
                  {assigning ? 'Assigning…' : 'Assign to Project'}
                </button>
                <button onClick={() => {
                  if (!c.email) { showToast('This customer has no email address on file.', 'error'); return; }
                  setEmailSubject(''); setEmailMessage(''); setEmailOpen(true);
                }} className="pmBtn" style={{ ...ghostButtonStyle, width: '100%' }}>
                  Send Email
                </button>
              </div>
            </SectionCard>

            {/* Compose & send — real email through the CRM, logged on the record */}
            {/* Rendered on <body>: drawn in place it sat inside the page's z-index:1
                layer, under the top bar and the phone tab bar. */}
            {emailOpen && createPortal(
              <div
                onClick={() => !emailSending && setEmailOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))' }}
              >
                <div
                  ref={emailDialogRef}
                  role="dialog" aria-modal="true" aria-label={`Email ${c.name}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', maxWidth: 520, background: 'var(--bg-solid-2)', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)' }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Email {c.name}</div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>To: {c.email}</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Subject"
                      aria-label="Subject"
                      style={{ width: '100%', borderRadius: 10, fontSize: 16, minHeight: 44 }}
                    />
                    <textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Write your message…"
                      aria-label="Message"
                      rows={7}
                      style={{ width: '100%', borderRadius: 10, resize: 'vertical', padding: '10px 12px', fontSize: 16 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={() => setEmailOpen(false)} disabled={emailSending} className="pmBtn" style={{ ...ghostButtonStyle }}>Cancel</button>
                    <button onClick={() => sendCustomerEmail(c.id)} disabled={emailSending} className="pmBtn" style={{ ...goldButtonStyle, opacity: emailSending ? 0.6 : 1, cursor: emailSending ? 'wait' : 'pointer' }}>
                      {emailSending ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

            {/* Projects & lifetime value — matched from live project data */}
            <SectionCard flat title="Projects & Lifetime Value" icon={<Buildings size={17} weight="duotone" color="var(--text-secondary)" />}>
              {(projectRollup.get(c.id)?.count || 0) > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: DIM }}>
                      {projectRollup.get(c.id)!.count} project{projectRollup.get(c.id)!.count === 1 ? '' : 's'} linked
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(projectRollup.get(c.id)!.value)}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {projectRollup.get(c.id)!.list.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 12px', background: mix(BG, 38), borderRadius: 8, border: `1px solid ${BORDER}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          {p.status && <div style={{ fontSize: 12, color: DIM, textTransform: 'capitalize' }}>{p.status}</div>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: p.value > 0 ? 'var(--text-primary)' : DIM, whiteSpace: 'nowrap' }}>{p.value > 0 ? fmt(p.value) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
                  No projects linked yet. Use Assign to Project and the new job is created under this
                  customer&apos;s name — its contract value rolls up here as lifetime value automatically.
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {detailTab === 'discovery' && (
          <SectionCard flat title="Discovery Answers" icon={<Clipboard size={17} weight="duotone" color="var(--text-secondary)" />}>
            {c.discovery_answers && Object.keys(c.discovery_answers).length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {Object.entries(c.discovery_answers).map(([key, val]) => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: mix(BG, 38), borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 20, display: 'inline-flex', alignItems: 'center' }}>
                      {key === 'project_type' ? <Buildings size={20} /> : key === 'budget' ? <CurrencyDollar size={20} /> : key === 'priorities' ? <Target size={20} /> :
                       key === 'timeline' ? <CalendarBlank size={20} /> : key === 'smart_interest' ? <Robot size={20} /> : <Clipboard size={20} />}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, color: DIM, textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>
                        {val.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<Clipboard size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No discovery data yet"
                description="Customer has not completed the discovery flow."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'recommendations' && (
          <SectionCard flat title="Recommendations" icon={<Target size={17} weight="duotone" color="var(--text-secondary)" />}>
            {c.recommendations && c.recommendations.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {c.recommendations.map(rec => (
                  <div key={rec.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: mix(BG, 38), borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{
                      fontSize: 18, display: 'inline-flex', alignItems: 'center',
                      color: rec.status === 'accepted' ? GREEN : rec.status === 'rejected' ? RED : AMBER,
                    }}>
                      {rec.status === 'accepted' ? <CheckCircle size={18} weight="fill" /> : rec.status === 'rejected' ? <XCircle size={18} weight="fill" /> : <Hourglass size={18} weight="fill" />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{rec.title}</div>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                      color: rec.status === 'accepted' ? GREEN : rec.status === 'rejected' ? RED : AMBER,
                    }}>{rec.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<Target size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No recommendations yet"
                description="No recommendations generated yet."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'designs' && (
          <SectionCard flat title="Design Sessions" icon={<House size={17} weight="duotone" color="var(--text-secondary)" />}>
            {c.design_sessions && c.design_sessions.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {c.design_sessions.map(ds => (
                  <div key={ds.id} style={{
                    padding: 16, background: mix(BG, 38), borderRadius: 12,
                    border: `1px solid ${BORDER}`, textAlign: 'center',
                  }}>
                    <div style={{
                      height: 80, background: `linear-gradient(135deg, ${mix(GOLD, 13)}, ${CARD})`,
                      borderRadius: 8, marginBottom: 10, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 30,
                    }}><House size={30} /></div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{ds.room}</div>
                    <div style={{ fontSize: 12, color: DIM }}>{ds.style} | {ds.date}</div>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<House size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No design sessions"
                description="No design sessions recorded."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'materials' && (
          <SectionCard flat title="Material Selections" icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />}>
            {c.material_selections && c.material_selections.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {c.material_selections.map((ms, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
                    background: mix(BG, 38), borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{ms.name}</div>
                      <div style={{ fontSize: 12, color: DIM }}>Qty: {ms.qty}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(ms.cost)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<Package size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No materials selected"
                description="Product and material picks from the design studio will appear here."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'conversations' && (
          <SectionCard flat title="Sage Conversations" icon={<Cactus size={17} weight="duotone" color="var(--text-secondary)" />}>
            {c.conversations && c.conversations.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {c.conversations.map((cv, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    background: mix(BG, 38), borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 20, display: 'inline-flex', alignItems: 'center' }}><Cactus size={20} color="var(--text-secondary)" /></span>
                    <div>
                      <div style={{ fontSize: 12, color: DIM, marginBottom: 2 }}>{cv.date}</div>
                      <div style={{ fontSize: 13 }}>{cv.preview}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<Cactus size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No conversation history"
                description="No conversation history."
              />
            )}
          </SectionCard>
        )}
      </PremiumSurface>
    );
  }

  /* ─── Main Table View ─── */
  return (
    <PremiumSurface>
      {/* Header */}
      <ModuleHero
        eyebrow="Customer Relationships"
        eyebrowIcon={<UsersThree size={13} weight="fill" color="var(--text-secondary)" />}
        title="Customer"
        accent="CRM"
        subtitle={loading ? 'Loading profiles…' : error ? 'Unable to load profiles' : `${customers.length} total profiles in your pipeline${lifetimeTotals.value > 0 ? ` · ${fmt(lifetimeTotals.value)} lifetime contract value` : ''}`}
        actions={
          <>
            <button type="button" onClick={openAdd} className="pmBtn" style={{ ...goldButtonStyle, minHeight: 44 }}>
              <Plus size={15} weight="bold" /> New Customer
            </button>
            <button type="button" onClick={exportCSV} className="pmBtn" style={{ ...goldOutlineButtonStyle, minHeight: 44 }}>
              <DownloadSimple size={15} weight="bold" /> Export Leads (CSV)
            </button>
          </>
        }
      />

      {customerForm}

      {/* KPI Row */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard
            icon={<UsersThree size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Total Profiles" value={String(customers.length)} accent={GOLD}
            sub="In pipeline" delay={0.02}
          />
          <StatCard
            icon={<Target size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Active Pipeline"
            value={String((statusCounts.lead || 0) + (statusCounts.qualified || 0) + (statusCounts.proposal || 0))}
            sub="Lead · Qualified · Proposal" accent={GOLD} delay={0.06}
          />
          <StatCard
            icon={<CheckCircle size={19} weight="duotone" color={GREEN} />}
            label="Customers Won" value={String(statusCounts.customer || 0)} accent={GREEN}
            sub="Converted" delay={0.10}
          />
          <StatCard
            icon={<CurrencyDollar size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Lifetime Value" value={fmt(lifetimeTotals.value)} accent={GOLD}
            sub={lifetimeTotals.withProjects > 0 ? `${lifetimeTotals.withProjects} customer${lifetimeTotals.withProjects === 1 ? '' : 's'} with projects` : 'Assign customers to projects'} delay={0.14}
          />
          <StatCard
            icon={<Gauge size={19} weight="duotone" color="var(--text-secondary)" />}
            label="Avg Lead Score" value={String(avgScore)} accent={scoreColor(avgScore)}
            sub="Across all leads" delay={0.18}
          />
        </div>
      )}

      {/* List toolbar — search + status/source/state filters (replaces pills + selects) */}
      <ListToolbar
        module="customers"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name or email…"
        filters={[
          { key: 'status', label: 'Status', value: filterStatus, onChange: setFilterStatus, allLabel: `All (${statusCounts.all})`, options: STATUSES.map(s => ({ value: s, label: `${s.charAt(0).toUpperCase() + s.slice(1)} (${statusCounts[s] || 0})` })) },
          { key: 'source', label: 'Source', value: filterSource, onChange: setFilterSource, allLabel: 'All Sources', options: [...SOURCES] },
          { key: 'state', label: 'State', value: filterState, onChange: setFilterState, allLabel: 'All States', options: [...US_STATES] },
        ]}
        count={{ shown: filtered.length, total: customers.length }}
        style={{ marginBottom: 20 }}
      />

      {/* Table */}
      {error ? (
        <SectionCard>
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Couldn't load customers"
            description="Something went wrong while loading customer profiles. Check your connection and try again."
            action={<button onClick={load} className="pmBtn" style={goldOutlineButtonStyle}>Retry</button>}
          />
        </SectionCard>
      ) : !loading && customers.length === 0 ? (
        <SectionCard flat>
          <PremiumEmpty
            icon={<UsersThree size={30} weight="duotone" color="var(--text-secondary)" />}
            title="No customers yet"
            description="Add the people you build for, or let leads arrive from your design studio, Sage chat and other sources. Each one tracks lead score, project count and lifetime contract value once you assign them to projects."
            action={
              <button type="button" onClick={openAdd} className="pmBtn" style={{ ...goldButtonStyle, minHeight: 44 }}>
                <Plus size={15} weight="bold" /> New Customer
              </button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard
          flush
          icon={<UsersThree size={17} weight="duotone" color="var(--text-secondary)" />}
          title="Customer Profiles"
          action={!loading ? <span style={{ fontSize: 13, fontWeight: 700, color: DIM }}>{filtered.length} shown</span> : undefined}
        >
          {loading ? (
            <div style={{ padding: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <PremiumEmpty
              compact
              icon={<UsersThree size={26} weight="duotone" color="var(--text-secondary)" />}
              title="No matches"
              description="No customers match your filters."
              onClearFilters={() => { setSearch(''); setFilterStatus('all'); setFilterSource('all'); setFilterState('all'); }}
            />
          ) : (
            <DataTable<Customer>
              key={justAdded ? `added-${justAdded}` : 'by-score'}
              columns={custColumns}
              rows={filtered}
              rowKey={c => c.id}
              defaultSort={justAdded ? { key: 'created_at', dir: 'desc' } : { key: 'lead_score', dir: 'desc' }}
              isSelected={justAdded ? (c => c.id === justAdded) : undefined}
              onRowClick={c => openCustomer(c)}
              tableId="company-customers"
              bulkEdit={{
                noun: 'customer',
                allowed: custRights.full,
                remove: { allowed: custRights.full, apply: (c) => jsonRequest(`/api/customers/${c.id}`, 'DELETE') },
                onDone: () => { void load(); },
              }}
              empty="No customers match your filters."
            />
          )}
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
