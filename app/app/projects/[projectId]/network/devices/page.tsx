'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const BASE = '#0F1419';
const CARD = '#1A1F2E';
const GOLD = '#D4A017';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = 'rgba(255,255,255,0.08)';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';

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

const TYPE_ICONS: Record<string, string> = {
  router: '🌐', switch: '🔀', firewall: '🛡️', access_point: '📡',
  printer: '🖨️', camera: '📹', server: '🖥️', workstation: '💻',
  voip_phone: '📞', iot: '🔌', modem: '📶', ups: '🔋',
};

const STATUS_COLORS: Record<string, string> = {
  online: GREEN, offline: RED, planned: '#6B7280', warning: GOLD, maintenance: BLUE,
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

  const handleSubmit = async () => {
    if (!form.hostname || !networkProjectId) return;
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
      }
    } catch { /* */ }
    setSaving(false);
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

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM, fontSize: 14 }}>Loading devices...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb + Header */}
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>
          Network &gt;
        </Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Devices</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Device Inventory</h1>
        <button
          onClick={() => { setShowForm(!showForm); setSelectedDevice(null); }}
          style={{
            padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add Device'}
        </button>
      </div>

      {/* Add Device Form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add New Device</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Device Type</label>
              <select value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })} style={inputStyle}>
                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Manufacturer</label>
              <select value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} style={inputStyle}>
                {MANUFACTURERS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
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
          <button onClick={handleSubmit} disabled={saving || !form.hostname} style={{
            marginTop: 16, padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: saving || !form.hostname ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Save Device'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search hostname or IP..."
          style={{ ...inputStyle, width: 240, flex: 'none' }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 160, flex: 'none' }}>
          <option value="">All Types</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 140, flex: 'none' }}>
          <option value="">All Statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="planned">Planned</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <div style={{ color: DIM, fontSize: 12, display: 'flex', alignItems: 'center' }}>
          {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Device Detail Panel */}
      {selectedDevice && (
        <div style={{ ...cardStyle, marginBottom: 24, borderColor: `${GOLD}40` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 32 }}>{TYPE_ICONS[selectedDevice.device_type] || '📦'}</span>
              <div>
                <h3 style={{ color: TEXT, fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedDevice.hostname}</h3>
                <div style={{ color: DIM, fontSize: 12 }}>
                  {selectedDevice.manufacturer} {selectedDevice.model} &middot; {selectedDevice.device_type.replace(/_/g, ' ')}
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedDevice(null)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18 }}>x</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
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
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 500, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>
          {selectedDevice.notes && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ color: DIM, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>NOTES</div>
              <div style={{ color: TEXT, fontSize: 13 }}>{selectedDevice.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Device Table */}
      <div style={{ ...cardStyle, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['', 'Hostname', 'Type', 'Manufacturer', 'Model', 'IP Address', 'MAC', 'VLAN', 'Location', 'Status'].map(col => (
                <th key={col} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDevices.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>No devices found. Add your first device above.</td></tr>
            ) : (
              filteredDevices.map(dev => (
                <tr
                  key={dev.id}
                  onClick={() => setSelectedDevice(dev)}
                  style={{ cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: 18 }}>{TYPE_ICONS[dev.device_type] || '📦'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 600 }}>{dev.hostname}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, textTransform: 'capitalize' }}>{dev.device_type.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, textTransform: 'capitalize' }}>{dev.manufacturer}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.model}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, fontFamily: 'monospace' }}>{dev.ip_address || '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 11, fontFamily: 'monospace' }}>{dev.mac_address || '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.vlan_name || '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>{dev.location || '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                      background: `${STATUS_COLORS[dev.status] || '#6B7280'}15`,
                      color: STATUS_COLORS[dev.status] || '#6B7280',
                      textTransform: 'capitalize',
                    }}>{dev.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}