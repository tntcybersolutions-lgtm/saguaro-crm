'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

interface NetworkProject {
  id: string;
  project_id: string;
  site_type: string;
  total_sq_ft: number;
  floor_count: number;
  status: string;
  created_at: string;
}

interface Device {
  id: string;
  hostname: string;
  device_type: string;
  manufacturer: string;
  model: string;
  ip_address: string;
  mac_address: string;
  status: string;
  vlan_id: string;
  location: string;
}

interface Vlan {
  id: string;
  vlan_id: number;
  name: string;
  subnet: string;
  purpose: string;
}

interface CableRun {
  id: string;
  label: string;
  cable_type: string;
  tested: boolean;
  test_result: string;
}

interface Alert {
  id: string;
  severity: string;
  message: string;
  created_at: string;
  resolved: boolean;
}

const DEVICE_TYPE_ICONS: Record<string, string> = {
  router: '🌐', switch: '🔀', firewall: '🛡️', access_point: '📡',
  printer: '🖨️', camera: '📹', server: '🖥️', workstation: '💻',
  voip_phone: '📞', iot: '🔌', modem: '📶', ups: '🔋',
};

const STATUS_COLORS: Record<string, string> = {
  online: GREEN, offline: RED, planned: '#6B7280', warning: GOLD,
};

const NAV_ITEMS = [
  { label: 'Devices', href: 'devices', icon: '💻', desc: 'Device inventory' },
  { label: 'VLANs', href: 'vlans', icon: '🔀', desc: 'VLAN management' },
  { label: 'Cables', href: 'cables', icon: '🔌', desc: 'Cable schedule' },
  { label: 'Firewall', href: 'firewall', icon: '🛡️', desc: 'Firewall rules' },
  { label: 'WiFi', href: 'wifi', icon: '📡', desc: 'WiFi & heatmap' },
  { label: 'Config', href: 'config', icon: '⚙️', desc: 'Config generator' },
  { label: 'Wizard', href: 'wizard', icon: '🤖', desc: 'AI network wizard' },
  { label: 'Reports', href: 'reports', icon: '📊', desc: 'Reports & exports' },
];

export default function NetworkDashboard() {
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();
  const [networkProject, setNetworkProject] = useState<NetworkProject | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [cables, setCables] = useState<CableRun[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ site_type: 'commercial_office', total_sq_ft: 5000, floor_count: 1 });
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) {
        setShowSetup(true);
        setLoading(false);
        return;
      }
      setNetworkProject(npData.networkProject);
      const npId = npData.networkProject.id;

      const [devRes, vlanRes, cableRes, alertRes] = await Promise.all([
        fetch(`/api/network/devices?networkProjectId=${npId}`),
        fetch(`/api/network/vlans?networkProjectId=${npId}`),
        fetch(`/api/network/cables?networkProjectId=${npId}`),
        fetch(`/api/network/alerts?networkProjectId=${npId}`),
      ]);
      const [devData, vlanData, cableData, alertData] = await Promise.all([
        devRes.json(), vlanRes.json(), cableRes.json(), alertRes.json(),
      ]);
      setDevices(devData.devices || []);
      setVlans(vlanData.vlans || []);
      setCables(cableData.cables || []);
      setAlerts(alertData.alerts || []);
    } catch { /* API may not exist yet */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSetup = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/network/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...setupForm }),
      });
      const data = await res.json();
      if (data.networkProject) {
        setNetworkProject(data.networkProject);
        setShowSetup(false);
      }
    } catch { /* handle */ }
    setCreating(false);
  };

  const devicesByType = devices.reduce<Record<string, Device[]>>((acc, d) => {
    (acc[d.device_type] = acc[d.device_type] || []).push(d);
    return acc;
  }, {});

  const testedCables = cables.filter(c => c.tested).length;
  const passedCables = cables.filter(c => c.test_result === 'pass').length;
  const openAlerts = alerts.filter(a => !a.resolved).length;

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 20,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: DIM, fontSize: 14 }}>Loading network module...</div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌐</div>
            <h2 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Set Up Network Module</h2>
            <p style={{ color: DIM, fontSize: 13, marginTop: 8 }}>Configure your low voltage / IT network for this project.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Site Type</label>
              <select
                value={setupForm.site_type}
                onChange={e => setSetupForm({ ...setupForm, site_type: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', background: BASE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none' }}
              >
                <option value="commercial_office">Commercial Office</option>
                <option value="retail">Retail</option>
                <option value="warehouse">Warehouse</option>
                <option value="medical">Medical / Healthcare</option>
                <option value="education">Education</option>
                <option value="hospitality">Hospitality</option>
                <option value="industrial">Industrial</option>
                <option value="residential_mdu">Residential MDU</option>
                <option value="mixed_use">Mixed Use</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Square Footage</label>
                <input
                  type="number"
                  value={setupForm.total_sq_ft}
                  onChange={e => setSetupForm({ ...setupForm, total_sq_ft: +e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: BASE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Floor Count</label>
                <input
                  type="number"
                  value={setupForm.floor_count}
                  onChange={e => setSetupForm({ ...setupForm, floor_count: +e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: BASE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>
            <button
              onClick={handleSetup}
              disabled={creating}
              style={{
                padding: '12px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Set Up Network Module'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Network Dashboard</h1>
          <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>
            {networkProject?.site_type?.replace(/_/g, ' ')} &middot; {networkProject?.total_sq_ft?.toLocaleString()} SF &middot; {networkProject?.floor_count} floor{(networkProject?.floor_count || 1) > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => router.push(`/app/projects/${projectId}/network/wizard`)}
            style={{
              padding: '10px 18px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, color: '#000',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🤖 AI Network Wizard
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Devices', value: devices.length, icon: '💻', color: BLUE },
          { label: 'Online', value: devices.filter(d => d.status === 'online').length, icon: '🟢', color: GREEN },
          { label: 'VLANs', value: vlans.length, icon: '🔀', color: '#8B5CF6' },
          { label: 'Cable Runs', value: `${testedCables}/${cables.length}`, icon: '🔌', color: GOLD },
          { label: 'Pass Rate', value: cables.length > 0 ? `${Math.round((passedCables / Math.max(testedCables, 1)) * 100)}%` : 'N/A', icon: '✅', color: GREEN },
          { label: 'Open Alerts', value: openAlerts, icon: '⚠️', color: openAlerts > 0 ? RED : GREEN },
        ].map(stat => (
          <div key={stat.label} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: DIM, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</div>
                <div style={{ color: TEXT, fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
              </div>
              <span style={{ fontSize: 24 }}>{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Quick Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Add Device', href: `devices`, icon: '➕' },
            { label: 'Add VLAN', href: `vlans`, icon: '🔀' },
            { label: 'Add Cable Run', href: `cables`, icon: '🔌' },
            { label: 'Scan Network', href: `#scan`, icon: '🔍' },
            { label: 'Generate Report', href: `reports`, icon: '📊' },
            { label: 'Ask Sage', href: `#sage`, icon: '🤖' },
          ].map(action => (
            <Link
              key={action.label}
              href={action.href.startsWith('#') ? '#' : `/app/projects/${projectId}/network/${action.href}`}
              style={{
                padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
                borderRadius: 8, color: TEXT, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = GOLD; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = BORDER; }}
            >
              {action.icon} {action.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Navigation Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={`/app/projects/${projectId}/network/${item.href}`}
            style={{ ...cardStyle, textDecoration: 'none', cursor: 'pointer', transition: 'all .2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{item.label}</div>
            <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      {/* Devices by Type */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Devices by Type</div>
        {Object.keys(devicesByType).length === 0 ? (
          <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 24 }}>
            No devices added yet.{' '}
            <Link href={`/app/projects/${projectId}/network/devices`} style={{ color: GOLD, textDecoration: 'none' }}>Add your first device</Link>
          </div>
        ) : (
          Object.entries(devicesByType).map(([type, devs]) => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{DEVICE_TYPE_ICONS[type] || '📦'}</span>
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</span>
                <span style={{
                  background: 'rgba(255,255,255,0.06)', color: DIM, fontSize: 11, padding: '2px 8px',
                  borderRadius: 10, fontWeight: 600,
                }}>{devs.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                {devs.map(dev => (
                  <Link
                    key={dev.id}
                    href={`/app/projects/${projectId}/network/devices?selected=${dev.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${BORDER}`,
                      textDecoration: 'none', transition: 'all .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: STATUS_COLORS[dev.status] || '#6B7280',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.hostname}</div>
                      <div style={{ color: DIM, fontSize: 11 }}>{dev.ip_address || 'No IP'} &middot; {dev.location || 'No location'}</div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: `${STATUS_COLORS[dev.status] || '#6B7280'}20`,
                      color: STATUS_COLORS[dev.status] || '#6B7280',
                      textTransform: 'capitalize',
                    }}>{dev.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Open Alerts */}
      {alerts.filter(a => !a.resolved).length > 0 && (
        <div style={{ ...cardStyle }}>
          <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Open Alerts</div>
          {alerts.filter(a => !a.resolved).map(alert => (
            <div key={alert.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: alert.severity === 'critical' ? `${RED}10` : 'rgba(255,255,255,0.03)',
              borderRadius: 8, border: `1px solid ${alert.severity === 'critical' ? `${RED}30` : BORDER}`,
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 16 }}>{alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 13 }}>{alert.message}</div>
                <div style={{ color: DIM, fontSize: 11 }}>{new Date(alert.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}