'use client';
/**
 * Network › VLANs — segment the job's network: VLAN ids, subnets, gateways
 * and DHCP scopes, with a live subnet calculator in the add form.
 *
 * Reads  GET  /api/network/projects?projectId=  →  GET /api/network/vlans?networkProjectId=
 * Writes POST /api/network/vlans
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Field, Input, FormGrid, FormModal,
  FormSection, DetailList, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { Network, Plus, Stack, Devices, Cpu, WarningCircle } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import NetworkTabs, { networkCrumbs, networkHref } from '../_components/NetworkTabs';

interface Vlan {
  id: string;
  network_project_id: string;
  vlan_id: number;
  name: string;
  subnet: string;
  gateway: string;
  dhcp_start: string;
  dhcp_end: string;
  purpose: string;
  description: string;
  device_count?: number;
  created_at: string;
}

const PURPOSES = ['data', 'voice', 'security', 'guest', 'iot', 'management', 'server', 'dmz'];
const PURPOSE_TONE: Record<string, BadgeTone> = {
  data: 'neutral', voice: 'lead', security: 'overdue', guest: 'under_contract',
  iot: 'ongoing', management: 'closed', server: 'completed', dmz: 'lead',
};

const PURPOSE_LABELS: Record<string, string> = { iot: 'IoT', dmz: 'DMZ' };
const purposeLabel = (p: string) => PURPOSE_LABELS[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : '');

function calculateSubnetInfo(cidr: string) {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  const ip = parts[0];
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) return null;

  const ipNum = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const totalHosts = Math.pow(2, 32 - prefix);
  const usableHosts = totalHosts > 2 ? totalHosts - 2 : 0;

  const toIp = (n: number) => `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

  return {
    network: toIp(network),
    broadcast: toIp(broadcast),
    firstUsable: usableHosts > 0 ? toIp(network + 1) : toIp(network),
    lastUsable: usableHosts > 0 ? toIp(broadcast - 1) : toIp(broadcast),
    mask: toIp(mask),
    totalHosts,
    usableHosts,
    prefix,
  };
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

export default function VlanManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [subnetInfo, setSubnetInfo] = useState<ReturnType<typeof calculateSubnetInfo>>(null);
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');

  const emptyForm = {
    vlan_id: 10, name: '', subnet: '', gateway: '', dhcp_start: '', dhcp_end: '',
    purpose: 'data', description: '',
  };
  const [form, setForm] = useState(emptyForm);

  /* Unsaved-work guard: the composer holds real typing, so leaving the page
   * confirms first and the draft is kept on this device either way. */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `network-vlans:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSubmit(),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/vlans?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setVlans(data.vlans || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load VLANs");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setSubnetInfo(form.subnet ? calculateSubnetInfo(form.subnet) : null);
  }, [form.subnet]);

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.name || !networkProjectId) return false;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/network/vlans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, network_project_id: networkProjectId }),
      });
      if (res.ok) {
        setForm(emptyForm);
        setShowForm(false);
        fetchData();
        guard.clearDraft();
        setSaving(false);
        show('VLAN saved');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't save the VLAN.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the VLAN.");
    }
    setSaving(false);
    return false;
  };

  const devicesAssigned = vlans.reduce((s, v) => s + (Number(v.device_count) || 0), 0);
  const dhcpScopes = vlans.filter((v) => v.dhcp_start && v.dhcp_end).length;
  const usableIps = vlans.reduce((s, v) => s + (calculateSubnetInfo(v.subnet || '')?.usableHosts || 0), 0);
  const purposes = new Set(vlans.map((v) => v.purpose)).size;

  const stats: StatItem[] = [
    { label: 'VLANs', value: loading ? '—' : String(vlans.length), sub: loading ? undefined : `${purposes} purpose${purposes === 1 ? '' : 's'} in use`, icon: <Stack size={15} /> },
    { label: 'Devices assigned', value: loading ? '—' : String(devicesAssigned), sub: 'Across all VLANs', icon: <Devices size={15} />, href: networkHref(projectId, 'devices') },
    { label: 'DHCP scopes', value: loading ? '—' : String(dhcpScopes), sub: loading ? undefined : `Of ${vlans.length} VLAN${vlans.length === 1 ? '' : 's'} have ranges`, icon: <Network size={15} /> },
    { label: 'Usable IPs planned', value: loading ? '—' : usableIps.toLocaleString(), sub: 'From subnet CIDRs', icon: <Cpu size={15} /> },
  ];

  const shown = vlans.filter(v => {
    if (purposeFilter && v.purpose !== purposeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [String(v.vlan_id), v.name, v.subnet, v.gateway].some(x => String(x || '').toLowerCase().includes(q));
  });

  const columns: Column<Vlan>[] = [
    { key: 'vlan_id', header: 'VLAN ID', width: 100, phone: 'show', render: (v) => <strong style={mono}>{v.vlan_id}</strong>, groupable: false },
    { key: 'name', header: 'Name', primary: true, phone: 'show' },
    { key: 'subnet', header: 'Subnet', phone: 'show', render: (v) => v.subnet ? <span style={mono}>{v.subnet}</span> : '—' },
    { key: 'gateway', header: 'Gateway', render: (v) => v.gateway ? <span style={mono}>{v.gateway}</span> : '—' },
    { key: 'dhcp', header: 'DHCP range', accessor: (v) => (v.dhcp_start && v.dhcp_end ? `${v.dhcp_start} – ${v.dhcp_end}` : ''), render: (v) => v.dhcp_start && v.dhcp_end ? <span style={mono}>{v.dhcp_start} – {v.dhcp_end}</span> : '—', groupable: false },
    { key: 'purpose', header: 'Purpose', accessor: (v) => purposeLabel(v.purpose), render: (v) => <Badge tone={PURPOSE_TONE[v.purpose] || 'neutral'}>{purposeLabel(v.purpose)}</Badge> },
    { key: 'device_count', header: 'Devices', align: 'right', total: 'sum', accessor: (v) => Number(v.device_count) || 0, render: (v) => v.device_count ?? 0 },
  ];

  const set = <K extends keyof typeof form>(k: K, val: (typeof form)[K]) => setForm({ ...form, [k]: val });
  const openForm = () => { setFormError(''); setShowForm(true); };

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'VLANs')}
      title="VLANs"
      subtitle="Segment the network, assign subnets and plan DHCP scopes."
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add VLAN</Button>}
    >
      <NetworkTabs projectId={projectId} value="vlans" />
      {!loadError && <StatRow items={stats} />}

      {!loadError && vlans.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search VLAN, name or subnet…"
          filters={
            <Select aria-label="Purpose" value={purposeFilter} onChange={e => setPurposeFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}
              options={[{ value: '', label: 'All purposes' }, ...PURPOSES.map(p => ({ value: p, label: purposeLabel(p) }))]} />
          }
        />
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load VLANs" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <DataTable<Vlan>
          tableId="project-network-vlans"
          exportName="vlans"
          columns={columns}
          rows={shown}
          loading={loading}
          rowKey={(v) => v.id}
          defaultSort={{ key: 'vlan_id', dir: 'asc' }}
          empty={
            vlans.length === 0 ? (
              <EmptyState icon={<Network size={22} />} title="No VLANs configured" text="Add the first VLAN to segment this job's network into subnets and DHCP scopes."
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add VLAN</Button>} />
            ) : (
              <EmptyState title="Nothing matches" text="Change the search or the filter."
                action={<Button onClick={() => { setSearch(''); setPurposeFilter(''); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      <FormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add VLAN"
        onSubmit={async () => { await handleSubmit(); }}
        submitLabel="Save VLAN"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={2}>
          <Field label="VLAN ID" required>
            <Input type="number" required value={form.vlan_id} onChange={e => set('vlan_id', +e.target.value)} />
          </Field>
          <Field label="Name" required>
            <Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Corporate Data" />
          </Field>
          <Field label="Subnet (CIDR)">
            <Input value={form.subnet} onChange={e => set('subnet', e.target.value)} placeholder="192.168.10.0/24" />
          </Field>
          <Field label="Gateway">
            <Input value={form.gateway} onChange={e => set('gateway', e.target.value)} placeholder="192.168.10.1" />
          </Field>
          <Field label="DHCP start">
            <Input value={form.dhcp_start} onChange={e => set('dhcp_start', e.target.value)} placeholder="192.168.10.100" />
          </Field>
          <Field label="DHCP end">
            <Input value={form.dhcp_end} onChange={e => set('dhcp_end', e.target.value)} placeholder="192.168.10.200" />
          </Field>
          <Field label="Purpose">
            <Select value={form.purpose} onChange={e => set('purpose', e.target.value)} options={PURPOSES.map(p => ({ value: p, label: purposeLabel(p) }))} />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={e => set('description', e.target.value)} />
          </Field>
          {subnetInfo && (
            <>
              <FormSection>Subnet calculator</FormSection>
              <div className="k-span-all">
                <DetailList items={[
                  ['Network', <span key="n" style={mono}>{subnetInfo.network}</span>],
                  ['Broadcast', <span key="b" style={mono}>{subnetInfo.broadcast}</span>],
                  ['First usable', <span key="f" style={mono}>{subnetInfo.firstUsable}</span>],
                  ['Last usable', <span key="l" style={mono}>{subnetInfo.lastUsable}</span>],
                  ['Subnet mask', <span key="m" style={mono}>{subnetInfo.mask}</span>],
                  ['Usable hosts', subnetInfo.usableHosts.toLocaleString()],
                ]} />
              </div>
            </>
          )}
        </FormGrid>
      </FormModal>

      <UnsavedGuardModal guard={guard} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
