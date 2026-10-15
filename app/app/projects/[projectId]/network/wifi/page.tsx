'use client';
/**
 * Network › WiFi — SSIDs and access points for the job, plus the hand-off to
 * Signal Studio (where coverage is actually designed) and its saved designs.
 *
 * Reads  GET  /api/network/projects?projectId=  →  GET /api/network/wifi | /api/network/access-points ?networkProjectId=
 *        GET  /api/heatmap/designs?projectId=    (saved Signal Studio designs)
 * Writes POST /api/network/wifi                  { ...ssid, enabled: true }
 *        POST /api/network/access-points         { ...ap, status: 'planned' }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Card, Toolbar, DataTable, EmptyState, Select, Field, Input,
  FormGrid, FormModal, ItemList, ItemRow, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { WifiHigh, Broadcast, UsersThree, MapTrifold, Plus, ArrowUpRight, WarningCircle } from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import NetworkTabs, { networkCrumbs } from '../_components/NetworkTabs';

interface WifiNetwork {
  id: string;
  network_project_id: string;
  ssid: string;
  security_type: string;
  password: string;
  vlan_id: string;
  vlan_name?: string;
  band: string;
  hidden: boolean;
  client_isolation: boolean;
  bandwidth_limit_mbps: number;
  enabled: boolean;
  client_count?: number;
  created_at: string;
}

interface AccessPoint {
  id: string;
  network_project_id: string;
  name: string;
  model: string;
  floor: number;
  x_position: number;
  y_position: number;
  coverage_radius: number;
  channel: number;
  power_dbm: number;
  status: string;
  ssid_ids: string[];
}

/** Metadata row from GET /api/heatmap/designs — a saved Signal Studio design. */
interface SavedDesign {
  id: string;
  name: string;
  coverage_percent: number | null;
  device_count: number;
  active_type: string | null;
  updated_at: string;
}

const SECURITY_TYPES = ['wpa3_enterprise', 'wpa3_personal', 'wpa2_enterprise', 'wpa2_personal', 'open'];
const BANDS = ['2.4ghz', '5ghz', 'dual', '6ghz'];

const SECURITY_TONE: Record<string, BadgeTone> = {
  wpa3_enterprise: 'ongoing', wpa3_personal: 'ongoing', wpa2_enterprise: 'neutral', wpa2_personal: 'neutral', open: 'overdue',
};
const SECURITY_LABELS: Record<string, string> = {
  wpa3_enterprise: 'WPA3 Enterprise', wpa3_personal: 'WPA3 Personal',
  wpa2_enterprise: 'WPA2 Enterprise', wpa2_personal: 'WPA2 Personal', open: 'Open',
};
const securityLabel = (s: string) => SECURITY_LABELS[s] || (s || '').replace(/_/g, ' ');
const BAND_LABELS: Record<string, string> = { '2.4ghz': '2.4 GHz', '5ghz': '5 GHz', dual: 'Dual', '6ghz': '6 GHz' };
const bandLabel = (b: string) => BAND_LABELS[b] || b;
const apTone = (s: string): BadgeTone => (s === 'online' ? 'ongoing' : s === 'offline' ? 'overdue' : 'closed');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Planned');

export default function WifiManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [aps, setAps] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSsidForm, setShowSsidForm] = useState(false);
  const [showApForm, setShowApForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(1);
  // Saved Signal Studio designs for this project — real engine runs, listed by name.
  const [designs, setDesigns] = useState<SavedDesign[]>([]);

  const emptySsidForm = {
    ssid: '', security_type: 'wpa2_enterprise', password: '', vlan_id: '', band: 'dual',
    hidden: false, client_isolation: false, bandwidth_limit_mbps: 0,
  };
  const [ssidForm, setSsidForm] = useState(emptySsidForm);

  const emptyApForm = {
    name: '', model: '', floor: 1, x_position: 50, y_position: 50,
    coverage_radius: 80, channel: 1, power_dbm: 20,
  };
  const [apForm, setApForm] = useState(emptyApForm);
  /* Unsaved-work guard: either composer holds real typing, so leaving this
   * module confirms first and the draft is kept on this device either way. */
  const composerDraft = { ssidForm, apForm };
  const composerDirty = useComposerDirty(showSsidForm || showApForm, composerDraft);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `network-wifi:${projectId}`,
    draftData: composerDraft,
    restoreDraft: (d) => {
      const v = d as typeof composerDraft;
      setSsidForm(v.ssidForm ?? emptySsidForm);
      setApForm(v.apForm ?? emptyApForm);
      setShowSsidForm(true);
    },
    onSave: () => (showApForm ? handleApSubmit() : handleSsidSubmit()),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const [wifiRes, apRes] = await Promise.all([
        fetch(`/api/network/wifi?networkProjectId=${npData.networkProject.id}`),
        fetch(`/api/network/access-points?networkProjectId=${npData.networkProject.id}`),
      ]);
      const [wifiData, apData] = await Promise.all([wifiRes.json(), apRes.json()]);
      setNetworks(wifiData.networks || []);
      setAps(apData.accessPoints || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load WiFi");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Saved Signal Studio designs — independent of the network-module setup.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/heatmap/designs?projectId=${projectId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && Array.isArray(d?.designs)) setDesigns(d.designs); })
      .catch(() => { /* optional list — the hand-off row still renders without it */ });
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSsidSubmit = async (): Promise<boolean> => {
    if (!ssidForm.ssid || !networkProjectId) return false;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/network/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ssidForm, network_project_id: networkProjectId, enabled: true }),
      });
      if (res.ok) {
        setSsidForm(emptySsidForm);
        setShowSsidForm(false);
        fetchData();
        guard.clearDraft();
        setSaving(false);
        show('SSID saved');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't save the SSID.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the SSID.");
    }
    setSaving(false);
    return false;
  };

  const handleApSubmit = async (): Promise<boolean> => {
    if (!apForm.name || !networkProjectId) return false;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/network/access-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...apForm, network_project_id: networkProjectId, status: 'planned' }),
      });
      if (res.ok) {
        setApForm(emptyApForm);
        setShowApForm(false);
        fetchData();
        guard.clearDraft();
        setSaving(false);
        show('Access point saved');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't save the access point.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the access point.");
    }
    setSaving(false);
    return false;
  };

  const totalClients = networks.reduce((sum, n) => sum + (n.client_count ?? 0), 0);
  const floorAps = aps.filter(a => a.floor === selectedFloor);
  const studioHref = `/app/signal-studio?projectId=${projectId}`;

  const openSsid = () => { setFormError(''); setShowSsidForm(true); };
  const openAp = () => { setFormError(''); setApForm({ ...apForm, floor: selectedFloor }); setShowApForm(true); };

  const stats: StatItem[] = [
    { label: 'WiFi networks', value: loading ? '—' : String(networks.length), sub: networks.length === 1 ? '1 SSID configured' : `${networks.length} SSIDs configured`, icon: <WifiHigh size={15} /> },
    { label: 'Access points', value: loading ? '—' : String(aps.length), sub: `${floorAps.length} on floor ${selectedFloor}`, icon: <Broadcast size={15} /> },
    { label: 'Connected clients', value: loading ? '—' : String(totalClients), sub: 'Across all SSIDs', tone: totalClients > 0 ? 'good' : 'default', icon: <UsersThree size={15} /> },
  ];

  const ssidColumns: Column<WifiNetwork>[] = [
    { key: 'ssid', header: 'SSID', primary: true, phone: 'show', render: (n) => <>{n.ssid}{n.hidden && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>(Hidden)</span>}</> },
    { key: 'security_type', header: 'Security', phone: 'show', accessor: (n) => securityLabel(n.security_type), render: (n) => <Badge tone={SECURITY_TONE[n.security_type] || 'neutral'}>{securityLabel(n.security_type)}</Badge> },
    { key: 'vlan_name', header: 'VLAN', render: (n) => n.vlan_name || '—' },
    { key: 'band', header: 'Band', accessor: (n) => bandLabel(n.band), render: (n) => bandLabel(n.band) },
    { key: 'client_isolation', header: 'Isolation', accessor: (n) => (n.client_isolation ? 'Isolated' : ''), render: (n) => (n.client_isolation ? 'Isolated' : '—') },
    { key: 'bandwidth_limit_mbps', header: 'Limit', align: 'right', render: (n) => (n.bandwidth_limit_mbps > 0 ? `${n.bandwidth_limit_mbps} Mbps` : '—') },
    { key: 'client_count', header: 'Clients', align: 'right', total: 'sum', phone: 'show', accessor: (n) => n.client_count ?? 0 },
  ];

  const apColumns: Column<AccessPoint>[] = [
    { key: 'name', header: 'Access point', primary: true, phone: 'show' },
    { key: 'model', header: 'Model', render: (a) => a.model || 'Unknown' },
    { key: 'channel', header: 'Channel', align: 'right', phone: 'show', render: (a) => `Ch ${a.channel}` },
    { key: 'power_dbm', header: 'Power', align: 'right', render: (a) => `${a.power_dbm} dBm` },
    { key: 'status', header: 'Status', phone: 'show', accessor: (a) => cap(a.status), render: (a) => <Badge tone={apTone(a.status)} dot>{cap(a.status)}</Badge> },
  ];

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'WiFi')}
      title="WiFi"
      subtitle="SSIDs, access points and the hand-off to Signal Studio."
      actions={
        <>
          <Button icon={<ArrowUpRight size={15} />} href={studioHref}>Open Signal Studio</Button>
          <Button icon={<Broadcast size={15} />} onClick={openAp}>Add AP</Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openSsid}>Add SSID</Button>
        </>
      }
    >
      <NetworkTabs projectId={projectId} value="wifi" />

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load WiFi" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <>
          <StatRow items={stats} />

          <Card title="WiFi networks" icon={<WifiHigh size={16} />} flush>
            <DataTable<WifiNetwork>
              tableId="project-network-wifi-ssids"
              exportName="wifi-networks"
              columns={ssidColumns}
              rows={networks}
              loading={loading}
              rowKey={(n) => n.id}
              defaultSort={{ key: 'ssid', dir: 'asc' }}
              empty={<EmptyState icon={<WifiHigh size={22} />} title="No SSIDs configured yet" text="Add the first wireless network to plan coverage and access."
                action={<Button icon={<Plus size={15} weight="bold" />} onClick={openSsid}>Add SSID</Button>} />}
            />
          </Card>

          <Card title="Coverage design" icon={<MapTrifold size={16} />} flush>
            <ItemList>
              <ItemRow
                icon={<Broadcast size={16} />}
                title="Design this floor in Signal Studio"
                desc="RF propagation over your real floor plan: walls, materials, AP placement, and a priced bid."
                action={<Button size="sm" icon={<ArrowUpRight size={14} />} href={studioHref}>Open</Button>}
              />
              {designs.map(d => (
                <ItemRow
                  key={d.id}
                  icon={<MapTrifold size={16} />}
                  title={d.name}
                  desc={`${d.device_count} device${d.device_count === 1 ? '' : 's'}${typeof d.coverage_percent === 'number' ? ` · ${Math.round(d.coverage_percent)}% predicted coverage` : ''} · updated ${new Date(d.updated_at).toLocaleDateString()}`}
                />
              ))}
            </ItemList>
          </Card>

          <Card
            title="Access points"
            subtitle={`${floorAps.length} on floor ${selectedFloor}`}
            icon={<Broadcast size={16} />}
            actions={<Button size="sm" icon={<Plus size={14} />} onClick={openAp}>Add AP</Button>}
            flush
          >
            <div style={{ padding: '0 16px 8px' }}>
              <Toolbar filters={
                <Select aria-label="Floor" value={String(selectedFloor)} onChange={e => setSelectedFloor(+e.target.value)} style={{ width: 'auto', minWidth: 120 }}
                  options={[1, 2, 3, 4, 5].map(f => ({ value: String(f), label: `Floor ${f}` }))} />
              } />
            </div>
            <DataTable<AccessPoint>
              tableId="project-network-wifi-aps"
              exportName="access-points"
              columns={apColumns}
              rows={floorAps}
              loading={loading}
              rowKey={(a) => a.id}
              defaultSort={{ key: 'name', dir: 'asc' }}
              empty={aps.length === 0
                ? <EmptyState icon={<Broadcast size={22} />} title="No access points logged yet" text="Track installed APs here, or design the placement first in Signal Studio."
                    action={<Button icon={<ArrowUpRight size={15} />} href={studioHref}>Open Signal Studio</Button>} />
                : <EmptyState title={`No access points on floor ${selectedFloor}`} text="Pick another floor or add one here." />}
            />
          </Card>
        </>
      )}

      <FormModal
        open={showSsidForm}
        onClose={() => setShowSsidForm(false)}
        title="Add WiFi network (SSID)"
        onSubmit={async () => { await handleSsidSubmit(); }}
        submitLabel="Save SSID"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="SSID name" required>
            <Input required value={ssidForm.ssid} onChange={e => setSsidForm({ ...ssidForm, ssid: e.target.value })} placeholder="Corporate-WiFi" />
          </Field>
          <Field label="Security">
            <Select value={ssidForm.security_type} onChange={e => setSsidForm({ ...ssidForm, security_type: e.target.value })} options={SECURITY_TYPES.map(s => ({ value: s, label: securityLabel(s) }))} />
          </Field>
          <Field label="Password">
            <Input type="password" value={ssidForm.password} onChange={e => setSsidForm({ ...ssidForm, password: e.target.value })} />
          </Field>
          <Field label="VLAN ID">
            <Input value={ssidForm.vlan_id} onChange={e => setSsidForm({ ...ssidForm, vlan_id: e.target.value })} placeholder="10" />
          </Field>
          <Field label="Band">
            <Select value={ssidForm.band} onChange={e => setSsidForm({ ...ssidForm, band: e.target.value })} options={BANDS.map(b => ({ value: b, label: bandLabel(b) }))} />
          </Field>
          <Field label="Bandwidth limit (Mbps)">
            <Input type="number" value={ssidForm.bandwidth_limit_mbps} onChange={e => setSsidForm({ ...ssidForm, bandwidth_limit_mbps: +e.target.value })} placeholder="0 = unlimited" />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={ssidForm.hidden} onChange={e => setSsidForm({ ...ssidForm, hidden: e.target.checked })} />
            Hidden SSID
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={ssidForm.client_isolation} onChange={e => setSsidForm({ ...ssidForm, client_isolation: e.target.checked })} />
            Client isolation
          </label>
        </FormGrid>
      </FormModal>

      <FormModal
        open={showApForm}
        onClose={() => setShowApForm(false)}
        title="Configure access point"
        onSubmit={async () => { await handleApSubmit(); }}
        submitLabel="Save AP"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="AP name" required>
            <Input required value={apForm.name} onChange={e => setApForm({ ...apForm, name: e.target.value })} placeholder="AP-F1-01" />
          </Field>
          <Field label="Model">
            <Input value={apForm.model} onChange={e => setApForm({ ...apForm, model: e.target.value })} placeholder="U6-Pro" />
          </Field>
          <Field label="Floor">
            <Input type="number" min={1} value={apForm.floor} onChange={e => setApForm({ ...apForm, floor: +e.target.value })} />
          </Field>
          <Field label="Channel">
            <Input type="number" value={apForm.channel} onChange={e => setApForm({ ...apForm, channel: +e.target.value })} />
          </Field>
          <Field label="Power (dBm)">
            <Input type="number" value={apForm.power_dbm} onChange={e => setApForm({ ...apForm, power_dbm: +e.target.value })} />
          </Field>
        </FormGrid>
      </FormModal>

      <UnsavedGuardModal guard={guard} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
