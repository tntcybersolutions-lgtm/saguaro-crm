'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import { useProjects } from '@/lib/hooks/useProjects';
import UserPicker from '@/components/UserPicker';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { UsersThree, WarningCircle, Buildings, CurrencyDollar, Target, CalendarBlank, Robot, Clipboard, CheckCircle, XCircle, Hourglass, House, Cactus, ArrowLeft, Gauge, MapPin, Lightning, Package, DownloadSimple } from '@phosphor-icons/react';
import { useToast } from '@/components/Toast';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';

/* ─── Palette ─── */
const BG = 'var(--bg-base)', CARD = 'var(--bg-surface)', GOLD = 'var(--brand-primary)', GREEN = '#2CFF7A';
const BORDER = 'rgba(255,255,255,0.12)', TEXT = '#FFFFFF', DIM = '#D4D4D8', DARK = 'var(--bg-base)';
const RED = '#FF3B30', AMBER = 'var(--warning)', BLUE = 'var(--brand-primary)', PURPLE = '#FF8A00';
/* Colors are CSS vars now, so a hex alpha suffix no longer works — tint with color-mix. */
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/* ─── Types ─── */
type CustomerStatus = 'lead' | 'qualified' | 'proposal' | 'customer' | 'lost';
type Customer = {
  id: string; name: string; email: string; phone: string; state: string;
  city: string; climate_zone: string; utility_rate: number;
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
const STATES_LIST = ['AZ', 'CA', 'CO', 'FL', 'GA', 'IL', 'MA', 'MI', 'MN', 'NC', 'NJ', 'NV', 'NY', 'OH', 'OR', 'PA', 'TX', 'VA', 'WA', 'WI'];

/* ─── Helpers ─── */
const fmt = (n: number | string | null | undefined) => '$' + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function CustomersPage() {
  const router = useRouter();
  const { showToast } = useToast();
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
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'discovery' | 'recommendations' | 'designs' | 'materials' | 'conversations'>('overview');

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
    { key: 'ltv', header: 'Lifetime Value', align: 'right', phone: 'show', accessor: c => (projectRollup.get(c.id)?.value || 0) > 0 ? projectRollup.get(c.id)?.value : null, render: c => { const v = projectRollup.get(c.id)?.value || 0; return v > 0 ? <span style={{ color: GOLD, fontWeight: 700 }}>{fmt(v)}</span> : '—'; } },
    { key: 'source', header: 'Source', phone: 'hide', accessor: c => c.source, render: c => c.source || '—' },
    { key: 'created_at', header: 'Created', phone: 'hide', accessor: c => c.created_at, render: c => fmtDate(c.created_at) },
  ], [projectRollup]);

  // Portfolio lifetime value across every customer with matched projects.
  const lifetimeTotals = useMemo(() => {
    let value = 0, withProjects = 0;
    projectRollup.forEach(r => { value += Number(r.value) || 0; if (r.count > 0) withProjects++; });
    return { value, withProjects };
  }, [projectRollup]);


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

  /* ─── Detail View ─── */
  if (selected) {
    const c = selected;
    const sb = c.score_breakdown || { engagement: 0, budget: 0, timeline: 0, fit: 0 };
    return (
      <PremiumSurface maxWidth={1000}>
        {/* Back button */}
        <button onClick={() => setSelected(null)} className="pmBtn" style={{ ...ghostButtonStyle, marginBottom: 20 }}>
          <ArrowLeft size={15} weight="bold" /> Back to Customers
        </button>

        {/* Identity Hero */}
        <ModuleHero
          eyebrow="Customer Profile"
          eyebrowIcon={<UsersThree size={13} weight="fill" color={GOLD} />}
          title={c.name}
          subtitle={`${c.email} · ${c.phone}`}
          actions={
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {(['overview', 'discovery', 'recommendations', 'designs', 'materials', 'conversations'] as const).map(tab => (
            <button key={tab} onClick={() => setDetailTab(tab)} className="pmBtn" style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${detailTab === tab ? GOLD : BORDER}`,
              background: detailTab === tab ? mix(GOLD, 9) : 'transparent',
              color: detailTab === tab ? GOLD : DIM,
              cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap',
              transition: 'background .15s ease, color .15s ease, border-color .15s ease',
            }}>{tab}</button>
          ))}
        </div>

        {/* Tab Content */}
        {detailTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {/* Geo Info */}
            <SectionCard flat title="Location & Geo" icon={<MapPin size={17} weight="duotone" color={GOLD} />}>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  ['City', c.city || '—'],
                  ['State', c.state],
                  ['Climate Zone', c.climate_zone || '—'],
                  ['Utility Rate', c.utility_rate ? `$${c.utility_rate}/kWh` : '—'],
                  ['Source', c.source],
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
            <SectionCard flat title="Lead Score Breakdown" icon={<Gauge size={17} weight="duotone" color={GOLD} />}>
              {Object.entries(sb).map(([key, val]) => (
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
            <SectionCard title="Actions" icon={<Lightning size={17} weight="duotone" color={GOLD} />}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: DIM }}>
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
            {emailOpen && (
              <div
                onClick={() => !emailSending && setEmailOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', maxWidth: 520, background: 'var(--bg-surface)', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)' }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Email {c.name}</div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>To: {c.email}</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Subject"
                      style={{ width: '100%', borderRadius: 10 }}
                    />
                    <textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Write your message…"
                      rows={7}
                      style={{ width: '100%', borderRadius: 10, resize: 'vertical', padding: '10px 12px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={() => setEmailOpen(false)} disabled={emailSending} className="pmBtn" style={{ ...ghostButtonStyle }}>Cancel</button>
                    <button onClick={() => sendCustomerEmail(c.id)} disabled={emailSending} className="pmBtn" style={{ ...goldButtonStyle, opacity: emailSending ? 0.6 : 1, cursor: emailSending ? 'wait' : 'pointer' }}>
                      {emailSending ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Projects & lifetime value — matched from live project data */}
            <SectionCard flat title="Projects & Lifetime Value" icon={<Buildings size={17} weight="duotone" color={GOLD} />}>
              {(projectRollup.get(c.id)?.count || 0) > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: DIM }}>
                      {projectRollup.get(c.id)!.count} project{projectRollup.get(c.id)!.count === 1 ? '' : 's'} linked
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{fmt(projectRollup.get(c.id)!.value)}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {projectRollup.get(c.id)!.list.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 12px', background: mix(BG, 38), borderRadius: 8, border: `1px solid ${BORDER}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          {p.status && <div style={{ fontSize: 11, color: DIM, textTransform: 'capitalize' }}>{p.status}</div>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: p.value > 0 ? GOLD : DIM, whiteSpace: 'nowrap' }}>{p.value > 0 ? fmt(p.value) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
                  No projects linked yet. Use Assign to Project and the new job is created under this
                  customer&apos;s name — its contract value rolls up here as lifetime value automatically.
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {detailTab === 'discovery' && (
          <SectionCard flat title="Discovery Answers" icon={<Clipboard size={17} weight="duotone" color={GOLD} />}>
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
                icon={<Clipboard size={30} weight="duotone" color={GOLD} />}
                title="No discovery data yet"
                description="Customer has not completed the discovery flow."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'recommendations' && (
          <SectionCard flat title="Recommendations" icon={<Target size={17} weight="duotone" color={GOLD} />}>
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
                icon={<Target size={30} weight="duotone" color={GOLD} />}
                title="No recommendations yet"
                description="No recommendations generated yet."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'designs' && (
          <SectionCard flat title="Design Sessions" icon={<House size={17} weight="duotone" color={GOLD} />}>
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
                icon={<House size={30} weight="duotone" color={GOLD} />}
                title="No design sessions"
                description="No design sessions recorded."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'materials' && (
          <SectionCard flat title="Material Selections" icon={<Package size={17} weight="duotone" color={GOLD} />}>
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmt(ms.cost)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <PremiumEmpty
                compact
                icon={<Package size={30} weight="duotone" color={GOLD} />}
                title="No materials selected"
                description="Product and material picks from the design studio will appear here."
              />
            )}
          </SectionCard>
        )}

        {detailTab === 'conversations' && (
          <SectionCard flat title="Sage Conversations" icon={<Cactus size={17} weight="duotone" color={GOLD} />}>
            {c.conversations && c.conversations.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {c.conversations.map((cv, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    background: mix(BG, 38), borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 20, display: 'inline-flex', alignItems: 'center' }}><Cactus size={20} color={GOLD} /></span>
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
                icon={<Cactus size={30} weight="duotone" color={GOLD} />}
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
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Customer Relationships"
        eyebrowIcon={<UsersThree size={13} weight="fill" color={GOLD} />}
        title="Customer"
        accent="CRM"
        subtitle={loading ? 'Loading profiles…' : error ? 'Unable to load profiles' : `${customers.length} total profiles in your pipeline${lifetimeTotals.value > 0 ? ` · ${fmt(lifetimeTotals.value)} lifetime contract value` : ''}`}
        actions={
          <button onClick={exportCSV} className="pmBtn" style={goldOutlineButtonStyle}>
            <DownloadSimple size={15} weight="bold" /> Export Leads (CSV)
          </button>
        }
      />

      {/* KPI Row */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard
            icon={<UsersThree size={19} weight="duotone" color={GOLD} />}
            label="Total Profiles" value={String(customers.length)} accent={GOLD}
            sub="In pipeline" delay={0.02}
          />
          <StatCard
            icon={<Target size={19} weight="duotone" color={GOLD} />}
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
            icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />}
            label="Lifetime Value" value={fmt(lifetimeTotals.value)} accent={GOLD}
            sub={lifetimeTotals.withProjects > 0 ? `${lifetimeTotals.withProjects} customer${lifetimeTotals.withProjects === 1 ? '' : 's'} with projects` : 'Assign customers to projects'} delay={0.14}
          />
          <StatCard
            icon={<Gauge size={19} weight="duotone" color={GOLD} />}
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
          { key: 'state', label: 'State', value: filterState, onChange: setFilterState, allLabel: 'All States', options: [...STATES_LIST] },
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
            icon={<UsersThree size={30} weight="duotone" color={GOLD} />}
            title="No customers yet"
            description="Customer profiles appear here as leads come in through your design studio, Sage chat, and other sources. Each one tracks lead score, project count, and lifetime contract value once you assign them to projects."
          />
        </SectionCard>
      ) : (
        <SectionCard
          flush
          icon={<UsersThree size={17} weight="duotone" color={GOLD} />}
          title="Customer Profiles"
          action={!loading ? <span style={{ fontSize: 12.5, fontWeight: 700, color: DIM }}>{filtered.length} shown</span> : undefined}
        >
          {loading ? (
            <div style={{ padding: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <PremiumEmpty
              compact
              icon={<UsersThree size={26} weight="duotone" color={GOLD} />}
              title="No matches"
              description="No customers match your filters."
            />
          ) : (
            <DataTable<Customer>
              columns={custColumns}
              rows={filtered}
              rowKey={c => c.id}
              defaultSort={{ key: 'lead_score', dir: 'desc' }}
              onRowClick={c => { setSelected(c); setDetailTab('overview'); }}
              empty="No customers match your filters."
            />
          )}
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
