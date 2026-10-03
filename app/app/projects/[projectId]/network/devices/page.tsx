'use client';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Globe, ArrowsLeftRight, Shield, WifiHigh, Printer, VideoCamera, HardDrives, Laptop, Phone, Plug, CellSignalFull, BatteryFull, Package, Plus, X, CheckCircle, WarningCircle, Clock } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, FlowStrip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const BASE = 'var(--bg-surface-2)';
const GOLD = 'var(--brand-primary)';
const GREEN = '#2CFF7A';
const BLUE = 'var(--brand-primary)';
const RED = '#FF3B30';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8';
const TEXT = '#FFFFFF';

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
const deviceTypeLabel = (t: string) => DEVICE_TYPE_LABELS[t] || t.replace(/_/g, ' ');

const MANUFACTURER_LABELS: Record<string, string> = { hp: 'HP', sonicwall: 'SonicWall' };
const manufacturerLabel = (m: string) => MANUFACTURER_LABELS[m] || m.charAt(0).toUpperCase() + m.slice(1);

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  router: Globe, switch: ArrowsLeftRight, firewall: Shield, access_point: WifiHigh,
  printer: Printer, camera: VideoCamera, server: HardDrives, workstation: Laptop,
  voip_phone: Phone, iot: Plug, modem: CellSignalFull, ups: BatteryFull,
};

function DeviceTypeIcon({ type, size, color }: { type: string; size: number; color: string }) {
  const IconComp = TYPE_ICONS[type] || Package;
  return <IconComp size={size} weight="regular" color={color} />;
}

const STATUS_COLORS: Record<string, string> = {
  online: GREEN, offline: RED, planned: '#6B7280', warning: 'var(--warning)', maintenance: BLUE,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};

const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function DeviceInventoryPage() {
  const { projectId } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');

  const [networkProjectId, setNetworkProjectId] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    device_type: 'switch', manufacturer: 'cisco', model: '', hostname: '',
    ip_address: '', mac_address: '', location: '', floor: 1, status: 'planned',
    firmware_version: '', serial_number: '', port_count: 24, notes: '', vlan_id: '',
  };
  const [form, setForm] = useState(emptyForm);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
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
    } catch { /* */ }
    setLoading(false);
  }, [projectId, selectedId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Dead-space kill (spec 4.1): an empty inventory opens straight into the
  // add-device composer. One-shot per visit so Cancel stays cancelled.
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
        return true;
      }
    } catch { /* */ }
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

  // Derived KPI counts over the full inventory (no extra fetching).
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const plannedCount = devices.filter(d => d.status === 'planned').length;

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textDecoration: 'none' }}>
          Network →
        </Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Devices</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="Network"
        eyebrowIcon={<HardDrives size={13} weight="fill" color={GOLD} />}
        title="Device"
        accent="Inventory"
        subtitle="Routers, switches, access points, and endpoints."
        actions={
          <button
            onClick={() => { setShowForm(!showForm); setSelectedDevice(null); }}
            className="pmBtn"
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? <>Cancel</> : <><Plus size={15} weight="bold" /> Add Device</>}
          </button>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<Package size={19} weight="duotone" color={GOLD} />}
          label="Total Devices" value={String(devices.length)} accent={GOLD}
          sub="In inventory" delay={0.02}
         href={`/app/projects/${projectId}/network/devices`}/>
        <StatCard
          icon={<CheckCircle size={19} weight="duotone" color={GREEN} />}
          label="Online" value={String(onlineCount)} accent={onlineCount ? GREEN : undefined}
          sub="Reporting up" delay={0.06}
         href={`/app/projects/${projectId}/network/devices`}/>
        <StatCard
          icon={<WarningCircle size={19} weight="duotone" color={RED} />}
          label="Offline" value={String(offlineCount)} accent={offlineCount ? RED : undefined}
          sub="Not reporting" delay={0.10}
         href={`/app/projects/${projectId}/network/devices`}/>
        <StatCard
          icon={<Clock size={19} weight="duotone" color="#94A3B8" />}
          label="Planned" value={String(plannedCount)} accent={plannedCount ? '#94A3B8' : undefined}
          sub="Not yet deployed" delay={0.14}
         href={`/app/projects/${projectId}/network/devices`}/>
      </div>

      {/* Add Device Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add New Device" icon={<Plus size={16} weight="bold" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Device Type</label>
                <select value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })} style={inputStyle}>
                  {DEVICE_TYPES.map(t => <option key={t} value={t}>{deviceTypeLabel(t)}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Manufacturer</label>
                <select value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} style={inputStyle}>
                  {MANUFACTURERS.map(m => <option key={m} value={m}>{manufacturerLabel(m)}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. Catalyst 9300" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Hostname *</label>
                <input value={form.hostname} onChange={e => setForm({ ...form, hostname: e.target.value })} placeholder="e.g. SW-FLOOR1-01" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>IP Address</label>
                <input value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>MAC Address</label>
                <input value={form.mac_address} onChange={e => setForm({ ...form, mac_address: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="MDF Room, IDF-2" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Floor</label>
                <input type="number" value={form.floor} onChange={e => setForm({ ...form, floor: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                  <option value="planned">Planned</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Port Count</label>
                <input type="number" value={form.port_count} onChange={e => setForm({ ...form, port_count: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Serial Number</label>
                <input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Firmware</label>
                <input value={form.firmware_version} onChange={e => setForm({ ...form, firmware_version: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.hostname}
              className="pmBtn"
              style={{
                ...goldButtonStyle, marginTop: 16,
                opacity: saving || !form.hostname ? 0.5 : 1,
                cursor: saving || !form.hostname ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save Device'}
            </button>
          </SectionCard>
        </div>
      )}

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <SectionCard>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search hostname or IP…"
              style={{ ...inputStyle, width: 240, flex: 'none' }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 160, flex: 'none' }}>
              <option value="">All Types</option>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{deviceTypeLabel(t)}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 140, flex: 'none' }}>
              <option value="">All Statuses</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="planned">Planned</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <div style={{ color: DIM, fontSize: 12, display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Device Detail Panel */}
      {selectedDevice && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard flat
            title={selectedDevice.hostname}
            subtitle={`${selectedDevice.manufacturer} ${selectedDevice.model} · ${deviceTypeLabel(selectedDevice.device_type)}`}
            icon={<DeviceTypeIcon type={selectedDevice.device_type} size={18} color={GOLD} />}
            style={{ borderColor: 'var(--brand-primary-35)' }}
            action={
              <button
                onClick={() => setSelectedDevice(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, color: DIM,
                }}
                aria-label="Close details"
              >
                <X size={16} weight="bold" />
              </button>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[
                { label: 'IP Address', value: selectedDevice.ip_address || 'N/A' },
                { label: 'MAC Address', value: selectedDevice.mac_address || 'N/A' },
                { label: 'Location', value: selectedDevice.location || 'N/A' },
                { label: 'Floor', value: selectedDevice.floor || 'N/A' },
                { label: 'Status', value: selectedDevice.status },
                { label: 'Ports', value: selectedDevice.port_count || 'N/A' },
                { label: 'Serial', value: selectedDevice.serial_number || 'N/A' },
                { label: 'Firmware', value: selectedDevice.firmware_version || 'N/A' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ color: DIM, fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: TEXT, fontSize: 14, fontWeight: 500, marginTop: 2 }}>{item.value}</div>
                </div>
              ))}
            </div>
            {selectedDevice.notes && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Notes</div>
                <div style={{ color: TEXT, fontSize: 13 }}>{selectedDevice.notes}</div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Device Table */}
      <SectionCard title="All Devices" icon={<HardDrives size={17} weight="duotone" color={GOLD} />} flush>
        {filteredDevices.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <Package size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                {devices.length === 0 ? 'No devices yet' : 'No devices match your filters'}
                <span style={{ fontWeight: 400, color: DIM }}>
                  {devices.length === 0
                    ? (showForm ? ' — add the first device in the form above; the inventory builds from there.' : ' — add the first device to start the network inventory.')
                    : ' — clear the type/status filters or adjust the search.'}
                </span>
              </div>
              {!showForm && (
                <button onClick={() => { setShowForm(true); setSelectedDevice(null); }} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Device</button>
              )}
            </div>
            {devices.length === 0 && (
              <FlowStrip steps={[
                { title: 'Add Devices', desc: 'Planned before install day' },
                { title: 'Assign VLANs and IPs', desc: 'From the IP plan' },
                { title: 'Flip to Online', desc: 'As gear is deployed' },
                { title: 'Reports Auto-Build', desc: 'IP schedule and as-builts' },
              ]} />
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['', 'Hostname', 'Type', 'Manufacturer', 'Model', 'IP Address', 'MAC', 'VLAN', 'Location', 'Status'].map(col => (
                    <th key={col} style={{ padding: '12px 14px', textAlign: 'left', color: DIM, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(dev => (
                  <tr
                    key={dev.id}
                    onClick={() => setSelectedDevice(dev)}
                    style={{ cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: 18 }}><DeviceTypeIcon type={dev.device_type} size={18} color={TEXT} /></td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 600 }}>{dev.hostname}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{deviceTypeLabel(dev.device_type)}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{manufacturerLabel(dev.manufacturer)}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.model}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, fontFamily: 'monospace' }}>{dev.ip_address || '—'}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 11, fontFamily: 'monospace' }}>{dev.mac_address || '—'}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.vlan_name || '—'}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.location || '—'}</td>
                    <td style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                        background: `color-mix(in srgb, ${STATUS_COLORS[dev.status] || '#6B7280'} 8%, transparent)`,
                        color: STATUS_COLORS[dev.status] || '#6B7280',
                        textTransform: 'capitalize',
                      }}>{dev.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
