'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
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

const PURPOSE_COLORS: Record<string, { bg: string; text: string }> = {
  data: { bg: `${BLUE}20`, text: BLUE },
  voice: { bg: '#8B5CF620', text: '#8B5CF6' },
  security: { bg: `${RED}20`, text: RED },
  guest: { bg: `${GOLD}20`, text: GOLD },
  iot: { bg: '#14B8A620', text: '#14B8A6' },
  management: { bg: '#6B728020', text: '#9CA3AF' },
  server: { bg: `${GREEN}20`, text: GREEN },
  dmz: { bg: '#F9731620', text: '#F97316' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

function calculateSubnetInfo(cidr: string) {
  try {
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
  } catch {
    return null;
  }
}

export default function VlanManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subnetInfo, setSubnetInfo] = useState<ReturnType<typeof calculateSubnetInfo>>(null);

  const emptyForm = {
    vlan_id: 10, name: '', subnet: '', gateway: '', dhcp_start: '', dhcp_end: '',
    purpose: 'data', description: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);
      const res = await fetch(`/api/network/vlans?networkProjectId=${npData.networkProject.id}`);
      const data = await res.json();
      setVlans(data.vlans || []);
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (form.subnet) {
      setSubnetInfo(calculateSubnetInfo(form.subnet));
    } else {
      setSubnetInfo(null);
    }
  }, [form.subnet]);

  const handleSubmit = async () => {
    if (!form.name || !networkProjectId) return;
    setSaving(true);
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
      }
    } catch { /* */ }
    setSaving(false);
  };

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading VLANs...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>VLANs</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>VLAN Manager</h1>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
          border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          {showForm ? 'Cancel' : '+ Add VLAN'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Add VLAN</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>VLAN ID *</label>
              <input type="number" value={form.vlan_id} onChange={e => setForm({ ...form, vlan_id: +e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Corporate Data" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Subnet (CIDR)</label>
              <input value={form.subnet} onChange={e => setForm({ ...form, subnet: e.target.value })} placeholder="192.168.10.0/24" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Gateway</label>
              <input value={form.gateway} onChange={e => setForm({ ...form, gateway: e.target.value })} placeholder="192.168.10.1" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>DHCP Start</label>
              <input value={form.dhcp_start} onChange={e => setForm({ ...form, dhcp_start: e.target.value })} placeholder="192.168.10.100" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>DHCP End</label>
              <input value={form.dhcp_end} onChange={e => setForm({ ...form, dhcp_end: e.target.value })} placeholder="192.168.10.200" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Purpose</label>
              <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} style={inputStyle}>
                {Object.keys(PURPOSE_COLORS).map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Subnet Calculator */}
          {subnetInfo && (
            <div style={{ marginTop: 16, padding: 14, background: `${BLUE}10`, borderRadius: 8, border: `1px solid ${BLUE}25` }}>
              <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Subnet Calculator</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                {[
                  { label: 'Network', value: subnetInfo.network },
                  { label: 'Broadcast', value: subnetInfo.broadcast },
                  { label: 'First Usable', value: subnetInfo.firstUsable },
                  { label: 'Last Usable', value: subnetInfo.lastUsable },
                  { label: 'Subnet Mask', value: subnetInfo.mask },
                  { label: 'Usable Hosts', value: subnetInfo.usableHosts.toLocaleString() },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ color: DIM, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ color: TEXT, fontSize: 13, fontFamily: 'monospace', marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving || !form.name} style={{
            marginTop: 16, padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: saving || !form.name ? 0.5 : 1,
          }}>
            {saving ? 'Saving...' : 'Save VLAN'}
          </button>
        </div>
      )}

      {/* VLAN Table */}
      <div style={{ ...cardStyle, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['VLAN ID', 'Name', 'Subnet', 'Gateway', 'DHCP Range', 'Purpose', 'Devices'].map(col => (
                <th key={col} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vlans.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>No VLANs configured. Add your first VLAN above.</td></tr>
            ) : (
              vlans.map(vlan => {
                const pc = PURPOSE_COLORS[vlan.purpose] || PURPOSE_COLORS.data;
                return (
                  <tr key={vlan.id}>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{vlan.vlan_id}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 600 }}>{vlan.name}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, fontFamily: 'monospace' }}>{vlan.subnet || '—'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontFamily: 'monospace' }}>{vlan.gateway || '—'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontFamily: 'monospace' }}>
                      {vlan.dhcp_start && vlan.dhcp_end ? `${vlan.dhcp_start} - ${vlan.dhcp_end}` : '—'}
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                        background: pc.bg, color: pc.text, textTransform: 'capitalize',
                      }}>{vlan.purpose}</span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 13, textAlign: 'center' }}>
                      {vlan.device_count ?? 0}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}