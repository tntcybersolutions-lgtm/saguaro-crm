'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Network, Plus, Calculator, Stack } from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
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
  data: { bg: 'var(--brand-primary-12)', text: BLUE },
  voice: { bg: '#8B5CF620', text: '#FF8A00' },
  security: { bg: `${RED}20`, text: RED },
  guest: { bg: 'var(--brand-primary-12)', text: GOLD },
  iot: { bg: '#14B8A620', text: '#2CFF7A' },
  management: { bg: '#6B728020', text: '#9CA3AF' },
  server: { bg: `${GREEN}20`, text: GREEN },
  dmz: { bg: '#F9731620', text: '#FF8A00' },
};

const PURPOSE_LABELS: Record<string, string> = { iot: 'IoT', dmz: 'DMZ' };
const purposeLabel = (p: string) => PURPOSE_LABELS[p] || p.charAt(0).toUpperCase() + p.slice(1);

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

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
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

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.name || !networkProjectId) return false;
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
        guard.clearDraft();
        setSaving(false);
        return true;
      }
    } catch { /* */ }
    setSaving(false);
    return false;
  };

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      <ModuleHero
        eyebrow="Network"
        eyebrowIcon={<Network size={13} weight="fill" color={GOLD} />}
        aux={<Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>&larr; Back to Network</Link>}
        title="VLAN"
        accent="Manager"
        subtitle="Segment the network, assign subnets, and plan DHCP scopes for this project."
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="pmBtn"
            style={showForm ? ghostButtonStyle : goldButtonStyle}
          >
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Add VLAN</>}
          </button>
        }
      />

      {/* Segmentation at a glance — every figure derived from the fetched VLANs */}
      {vlans.length > 0 && (() => {
        const devicesAssigned = vlans.reduce((s, v) => s + (Number(v.device_count) || 0), 0);
        const dhcpScopes = vlans.filter((v) => v.dhcp_start && v.dhcp_end).length;
        const usableIps = vlans.reduce((s, v) => s + (calculateSubnetInfo(v.subnet || '')?.usableHosts || 0), 0);
        const purposes = new Set(vlans.map((v) => v.purpose)).size;
        return (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/network/vlans`,  label: 'VLANs', value: String(vlans.length), sub: `${purposes} purpose${purposes === 1 ? '' : 's'} in use` },
            {href: `/app/projects/${projectId}/network/devices`,  label: 'Devices Assigned', value: String(devicesAssigned), sub: 'Across all VLANs' },
            {href: `/app/projects/${projectId}/network/vlans`,  label: 'DHCP Scopes', value: String(dhcpScopes), sub: `Of ${vlans.length} VLAN${vlans.length === 1 ? '' : 's'} have ranges` },
            {href: `/app/projects/${projectId}/network/vlans`,  label: 'Usable IPs Planned', value: usableIps.toLocaleString(), sub: 'From subnet CIDRs' },
          ]} />
        );
      })()}

      {showForm && (
        <div style={{ marginBottom: 24 }}>
        <SectionCard title="Add VLAN" icon={<Plus size={17} weight="bold" color={GOLD} />}>
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
                {Object.keys(PURPOSE_COLORS).map(p => <option key={p} value={p}>{purposeLabel(p)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Subnet Calculator */}
          {subnetInfo && (
            <div style={{ marginTop: 16, padding: 14, background: 'var(--brand-primary-08)', borderRadius: 8, border: '1px solid var(--brand-primary-18)' }}>
              <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Calculator size={14} weight="duotone" color={BLUE} /> Subnet Calculator</div>
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
                    <div style={{ color: DIM, fontSize: 10, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ color: TEXT, fontSize: 13, fontFamily: 'monospace', marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving || !form.name}
            className="pmBtn"
            style={{ ...goldButtonStyle, marginTop: 16, opacity: saving || !form.name ? 0.5 : 1, cursor: saving || !form.name ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save VLAN'}
          </button>
        </SectionCard>
        </div>
      )}

      {/* VLAN Table */}
      <SectionCard
        title="Configured VLANs"
        icon={<Stack size={17} weight="duotone" color={GOLD} />}
        flush
      >
      {vlans.length === 0 ? (
        <PremiumEmpty
          icon={<Network size={30} weight="duotone" color={GOLD} />}
          title="No VLANs configured"
          description="Add your first VLAN to segment this project's network into subnets and DHCP scopes."
          action={
            <button onClick={() => setShowForm(true)} className="pmBtn" style={goldButtonStyle}>
              <Plus size={15} weight="bold" /> Add VLAN
            </button>
          }
        />
      ) : (
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
        <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['VLAN ID', 'Name', 'Subnet', 'Gateway', 'DHCP Range', 'Purpose', 'Devices'].map(col => (
                <th key={col} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vlans.map(vlan => {
                const pc = PURPOSE_COLORS[vlan.purpose] || PURPOSE_COLORS.data;
                return (
                  <tr key={vlan.id}>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{vlan.vlan_id}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 600 }}>{vlan.name}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12, fontFamily: 'monospace' }}>{vlan.subnet || '—'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontFamily: 'monospace' }}>{vlan.gateway || '—'}</td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontFamily: 'monospace' }}>
                      {vlan.dhcp_start && vlan.dhcp_end ? `${vlan.dhcp_start} – ${vlan.dhcp_end}` : '—'}
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
                        background: pc.bg, color: pc.text,
                      }}>{purposeLabel(vlan.purpose)}</span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 13, textAlign: 'center' }}>
                      {vlan.device_count ?? 0}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      )}
      </SectionCard>
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}