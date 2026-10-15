'use client';
/**
 * Network › Devices — every router, switch, AP and endpoint on the job with
 * its IP, MAC, VLAN, location and status. Row click opens the device detail.
 *
 * Reads  GET  /api/network/projects?projectId=  →  GET /api/network/devices?networkProjectId=
 * Writes POST /api/network/devices
 * Deep link ?selected=<deviceId> opens that device (used by the Network overview).
 */
import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Card, Toolbar, DataTable, EmptyState, Select, Field, Input, Textarea,
  FormGrid, FormModal, DetailList, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Globe, ArrowsLeftRight, Shield, WifiHigh, Printer, VideoCamera, HardDrives, Laptop, Phone, Plug,
  CellSignalFull, BatteryFull, Package, Plus, X, CheckCircle, WarningCircle, Clock, type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import NetworkTabs, { networkCrumbs } from '../_components/NetworkTabs';

interface Device {
  id: string;
  network_project_id: string;
  hostname: string;
  device_type: string;
  manufacturer: string;
  model: string;
  ip_address: string;
  mac_address: string;
  vlan_id: string;
  vlan_name?: string;
  location: string;
  floor: number;
  status: string;
  firmware_version: string;
  serial_number: string;
  port_count: number;
  notes: string;
  config_id: string;
  created_at: string;
}

const DEVICE_TYPES = [
  'router', 'switch', 'firewall', 'access_point', 'printer', 'camera',
  'server', 'workstation', 'voip_phone', 'iot', 'modem', 'ups',
];

const MANUFACTURERS = [
  'cisco', 'ubiquiti', 'meraki', 'aruba', 'fortinet', 'sonicwall', 'hp', 'dell', 'other',
];

const DEVICE_TYPE_LABELS: Record<string, string> = {
  router: 'Router', switch: 'Switch', firewall: 'Firewall', access_point: 'Access Point',
  printer: 'Printer', camera: 'Camera', server: 'Server', workstation: 'Workstation',
  voip_phone: 'VoIP Phone', iot: 'IoT', modem: 'Modem', ups: 'UPS',
};
const deviceTypeLabel = (t: string) => DEVICE_TYPE_LABELS[t] || (t || '').replace(/_/g, ' ');

const MANUFACTURER_LABELS: Record<string, string> = { hp: 'HP', sonicwall: 'SonicWall' };
const manufacturerLabel = (m: string) => MANUFACTURER_LABELS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : '');

const TYPE_ICONS: Record<string, PhosphorIcon> = {
  router: Globe, switch: ArrowsLeftRight, firewall: Shield, access_point: WifiHigh,
  printer: Printer, camera: VideoCamera, server: HardDrives, workstation: Laptop,
  voip_phone: Phone, iot: Plug, modem: CellSignalFull, ups: BatteryFull,
};

function DeviceTypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const IconComp = TYPE_ICONS[type] || Package;
  return <IconComp size={size} />;
}

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'maintenance', label: 'Maintenance' },
];
const statusLabel = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.label || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Planned');
function statusTone(s: string): BadgeTone {
  if (s === 'online') return 'ongoing';
  if (s === 'offline') return 'overdue';
  if (s === 'maintenance' || s === 'warning') return 'lead';
  if (s === 'planned') return 'closed';
  return 'neutral';
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

function DeviceInventoryPage() {
  const { projectId } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();

  const [networkProjectId, setNetworkProjectId] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const emptyForm = {
    device_type: 'switch', manufacturer: 'cisco', model: '', hostname: '',
    ip_address: '', mac_address: '', location: '', floor: 1, status: 'planned',
    firmware_version: '', serial_number: '', port_count: 24, notes: '', vlan_id: '',
  };
  const [form, setForm] = useState(emptyForm);

  /* Unsaved-work guard: the composer holds real typing, so leaving the page
   * confirms first and the draft is kept on this device either way. */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `network-devices:${projectId}`,
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
      const npId = npData.networkProject.id;
      setNetworkProjectId(npId);
      const devRes = await fetch(`/api/network/devices?networkProjectId=${npId}`);
      const devData = await devRes.json();
      setDevices(devData.devices || []);
      if (selectedId) {
        const found = (devData.devices || []).find((d: Device) => d.id === selectedId);
        if (found) setSelectedDevice(found);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load devices");
    }
    setLoading(false);
  }, [projectId, selectedId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // An empty inventory opens straight into the add-device form. One-shot per
  // visit so Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && networkProjectId && devices.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, networkProjectId, devices.length]);

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.hostname || !networkProjectId) return false;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/network/devices', {
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
        show('Device saved');
        return true;
      }
      const j = await res.json().catch(() => ({}));
      setFormError(j.error || "Couldn't save the device.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the device.");
    }
    setSaving(false);
    return false;
  };

  const filteredDevices = devices.filter(d => {
    if (filterType && d.device_type !== filterType) return false;
    if (filterStatus && d.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return d.hostname.toLowerCase().includes(s) || (d.ip_address || '').toLowerCase().includes(s);
    }
    return true;
  });

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const plannedCount = devices.filter(d => d.status === 'planned').length;

  const stats: StatItem[] = [
    { label: 'Total devices', value: loading ? '—' : String(devices.length), sub: 'In inventory', icon: <Package size={15} />, onClick: () => setFilterStatus(''), active: filterStatus === '' },
    { label: 'Online', value: loading ? '—' : String(onlineCount), sub: 'Reporting up', tone: onlineCount ? 'good' : 'default', icon: <CheckCircle size={15} />, onClick: () => setFilterStatus('online'), active: filterStatus === 'online' },
    { label: 'Offline', value: loading ? '—' : String(offlineCount), sub: 'Not reporting', tone: offlineCount ? 'bad' : 'default', icon: <WarningCircle size={15} />, onClick: () => setFilterStatus('offline'), active: filterStatus === 'offline' },
    { label: 'Planned', value: loading ? '—' : String(plannedCount), sub: 'Not yet deployed', icon: <Clock size={15} />, onClick: () => setFilterStatus('planned'), active: filterStatus === 'planned' },
  ];

  const columns: Column<Device>[] = [
    { key: 'hostname', header: 'Hostname', primary: true, phone: 'show', render: (d) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><DeviceTypeIcon type={d.device_type} />{d.hostname}</span> },
    { key: 'device_type', header: 'Type', accessor: (d) => deviceTypeLabel(d.device_type), render: (d) => deviceTypeLabel(d.device_type) },
    { key: 'manufacturer', header: 'Manufacturer', accessor: (d) => manufacturerLabel(d.manufacturer), render: (d) => manufacturerLabel(d.manufacturer) || '—' },
    { key: 'model', header: 'Model', render: (d) => d.model || '—' },
    { key: 'ip_address', header: 'IP address', phone: 'show', render: (d) => d.ip_address ? <span style={mono}>{d.ip_address}</span> : '—' },
    { key: 'mac_address', header: 'MAC', render: (d) => d.mac_address ? <span style={mono}>{d.mac_address}</span> : '—' },
    { key: 'vlan_name', header: 'VLAN', render: (d) => d.vlan_name || '—' },
    { key: 'location', header: 'Location', render: (d) => d.location || '—' },
    { key: 'status', header: 'Status', phone: 'show', accessor: (d) => statusLabel(d.status), render: (d) => <Badge tone={statusTone(d.status)} dot>{statusLabel(d.status)}</Badge> },
  ];

  const openForm = () => { setFormError(''); setShowForm(true); setSelectedDevice(null); };
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm({ ...form, [k]: v });

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Devices')}
      title="Devices"
      subtitle="Routers, switches, access points and endpoints."
      actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add device</Button>}
    >
      <NetworkTabs projectId={projectId} value="devices" />
      {!loadError && <StatRow items={stats} />}

      {!loadError && devices.length > 0 && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search hostname or IP…"
          filters={
            <>
              <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 'auto', minWidth: 160 }}
                options={[{ value: '', label: 'All types' }, ...DEVICE_TYPES.map(t => ({ value: t, label: deviceTypeLabel(t) }))]} />
              <Select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]} />
            </>
          }
        />
      )}

      {selectedDevice && (
        <Card
          title={selectedDevice.hostname}
          subtitle={`${manufacturerLabel(selectedDevice.manufacturer)} ${selectedDevice.model || ''} · ${deviceTypeLabel(selectedDevice.device_type)}`}
          icon={<DeviceTypeIcon type={selectedDevice.device_type} size={18} />}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close details" onClick={() => setSelectedDevice(null)} />}
        >
          <DetailList items={[
            ['IP Address', selectedDevice.ip_address || 'N/A'],
            ['MAC Address', selectedDevice.mac_address || 'N/A'],
            ['Location', selectedDevice.location || 'N/A'],
            ['Floor', selectedDevice.floor || 'N/A'],
            ['Status', <Badge key="s" tone={statusTone(selectedDevice.status)} dot>{statusLabel(selectedDevice.status)}</Badge>],
            ['Ports', selectedDevice.port_count || 'N/A'],
            ['Serial', selectedDevice.serial_number || 'N/A'],
            ['Firmware', selectedDevice.firmware_version || 'N/A'],
            ...(selectedDevice.notes ? [['Notes', selectedDevice.notes] as [string, React.ReactNode]] : []),
          ]} />
        </Card>
      )}

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load devices" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <DataTable<Device>
          tableId="project-network-devices"
          exportName="network-devices"
          columns={columns}
          rows={filteredDevices}
          loading={loading}
          rowKey={(d) => d.id}
          defaultSort={{ key: 'hostname', dir: 'asc' }}
          onRowClick={(d) => setSelectedDevice(d)}
          isSelected={(d) => d.id === selectedDevice?.id}
          rowActions={(d) => [{ label: 'View details', icon: <HardDrives size={14} />, onClick: () => setSelectedDevice(d) }]}
          empty={
            devices.length === 0 ? (
              <EmptyState icon={<Package size={22} />} title="No devices yet" text="Add the first device to start the network inventory."
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add device</Button>} />
            ) : (
              <EmptyState title="No devices match your filters" text="Clear the type/status filters or adjust the search."
                action={<Button onClick={() => { setSearch(''); setFilterType(''); setFilterStatus(''); }}>Clear filters</Button>} />
            )
          }
        />
      )}

      <FormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add device"
        onSubmit={async () => { await handleSubmit(); }}
        submitLabel="Save device"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={3}>
          <Field label="Device type">
            <Select value={form.device_type} onChange={e => set('device_type', e.target.value)} options={DEVICE_TYPES.map(t => ({ value: t, label: deviceTypeLabel(t) }))} />
          </Field>
          <Field label="Manufacturer">
            <Select value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} options={MANUFACTURERS.map(m => ({ value: m, label: manufacturerLabel(m) }))} />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="e.g. Catalyst 9300" />
          </Field>
          <Field label="Hostname" required>
            <Input required value={form.hostname} onChange={e => set('hostname', e.target.value)} placeholder="e.g. SW-FLOOR1-01" />
          </Field>
          <Field label="IP address">
            <Input value={form.ip_address} onChange={e => set('ip_address', e.target.value)} placeholder="192.168.1.1" />
          </Field>
          <Field label="MAC address">
            <Input value={form.mac_address} onChange={e => set('mac_address', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="MDF Room, IDF-2" />
          </Field>
          <Field label="Floor">
            <Input type="number" value={form.floor} onChange={e => set('floor', +e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => set('status', e.target.value)} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Port count">
            <Input type="number" value={form.port_count} onChange={e => set('port_count', +e.target.value)} />
          </Field>
          <Field label="Serial number">
            <Input value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </Field>
          <Field label="Firmware">
            <Input value={form.firmware_version} onChange={e => set('firmware_version', e.target.value)} />
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </Field>
        </FormGrid>
      </FormModal>

      <UnsavedGuardModal guard={guard} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}

export default function DeviceInventoryRoute() {
  return (
    <Suspense fallback={null}>
      <DeviceInventoryPage />
    </Suspense>
  );
}
