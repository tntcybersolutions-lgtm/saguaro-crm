'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { WifiHigh, Broadcast, UsersThree, MapTrifold, Plus, ArrowUpRight } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';

import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const BASE = '#1c1c1e';
const GOLD = '#F59E0B';
const GREEN = '#22C55E';
const BLUE = '#F59E0B';
const RED = '#EF4444';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';

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

const SECURITY_COLORS: Record<string, { bg: string; text: string }> = {
  wpa3_enterprise: { bg: `${GREEN}20`, text: GREEN },
  wpa3_personal: { bg: `${GREEN}15`, text: GREEN },
  wpa2_enterprise: { bg: `${BLUE}20`, text: BLUE },
  wpa2_personal: { bg: `${BLUE}15`, text: BLUE },
  open: { bg: `${RED}20`, text: RED },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function WifiManagerPage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [aps, setAps] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSsidForm, setShowSsidForm] = useState(false);
  const [showApForm, setShowApForm] = useState(false);
  const [saving, setSaving] = useState(false);
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
  /* ── Unsaved-work guard: either composer holds real typing, so leaving this
   *    module (sidebar, ⌘K, breadcrumb, back) confirms first and the draft is
   *    kept on this device either way. ── */
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
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Saved Signal Studio designs — independent of the network-module setup, so the
  // hand-off card can surface them even before this module has data.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/heatmap/designs?projectId=${projectId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && Array.isArray(d?.designs)) setDesigns(d.designs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSsidSubmit = async (): Promise<boolean> => {
    if (!ssidForm.ssid || !networkProjectId) return false;
    setSaving(true);
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
        return true;
      }
    } catch { /* */ }
    setSaving(false);
    return false;
  };

  const handleApSubmit = async (): Promise<boolean> => {
    if (!apForm.name || !networkProjectId) return false;
    setSaving(true);
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
        return true;
      }
    } catch { /* */ }
    setSaving(false);
    return false;
  };

  const totalClients = networks.reduce((sum, n) => sum + (n.client_count ?? 0), 0);
  const floorApCount = aps.filter(a => a.floor === selectedFloor).length;

  if (loading) {
    return <PremiumSurface maxWidth={2200}><ModuleSkeleton kpis={4} rows={5} /></PremiumSurface>;
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>WiFi</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="Network"
        eyebrowIcon={<WifiHigh size={13} weight="fill" color={GOLD} />}
        title="WiFi"
        accent="Manager"
        subtitle="SSIDs, access points, and hand-off to Signal Studio."
        actions={
          <button onClick={() => setShowSsidForm(!showSsidForm)} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Add SSID
          </button>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<WifiHigh size={19} weight="duotone" color={GOLD} />}
          label="WiFi Networks" value={String(networks.length)} accent={GOLD}
          sub={networks.length === 1 ? '1 SSID configured' : `${networks.length} SSIDs configured`}
         href={`/app/projects/${projectId}/network/wifi`}/>
        <StatCard
          icon={<Broadcast size={19} weight="duotone" color={BLUE} />}
          label="Access Points" value={String(aps.length)} accent={BLUE}
          sub={`${floorApCount} on floor ${selectedFloor}`}
         href={`/app/projects/${projectId}/network/wifi`}/>
        <StatCard
          icon={<UsersThree size={19} weight="duotone" color={GREEN} />}
          label="Connected Clients" value={String(totalClients)} accent={totalClients > 0 ? GREEN : undefined}
          sub="across all SSIDs"
         href={`/app/projects/${projectId}/network/wifi`}/>
      </div>

      {/* Add SSID Form */}
      {showSsidForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Add WiFi Network (SSID)" icon={<WifiHigh size={17} weight="duotone" color={GOLD} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>SSID Name *</label>
                <input value={ssidForm.ssid} onChange={e => setSsidForm({ ...ssidForm, ssid: e.target.value })} placeholder="Corporate-WiFi" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Security</label>
                <select value={ssidForm.security_type} onChange={e => setSsidForm({ ...ssidForm, security_type: e.target.value })} style={inputStyle}>
                  {SECURITY_TYPES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input type="password" value={ssidForm.password} onChange={e => setSsidForm({ ...ssidForm, password: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>VLAN ID</label>
                <input value={ssidForm.vlan_id} onChange={e => setSsidForm({ ...ssidForm, vlan_id: e.target.value })} placeholder="10" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Band</label>
                <select value={ssidForm.band} onChange={e => setSsidForm({ ...ssidForm, band: e.target.value })} style={inputStyle}>
                  {BANDS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Bandwidth Limit (Mbps)</label>
                <input type="number" value={ssidForm.bandwidth_limit_mbps} onChange={e => setSsidForm({ ...ssidForm, bandwidth_limit_mbps: +e.target.value })} placeholder="0 = unlimited" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ssidForm.hidden} onChange={e => setSsidForm({ ...ssidForm, hidden: e.target.checked })} />
                  Hidden SSID
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ssidForm.client_isolation} onChange={e => setSsidForm({ ...ssidForm, client_isolation: e.target.checked })} />
                  Client Isolation
                </label>
              </div>
            </div>
            <button onClick={handleSsidSubmit} disabled={saving || !ssidForm.ssid} className="pmBtn" style={{
              ...goldButtonStyle, marginTop: 16,
              opacity: saving || !ssidForm.ssid ? 0.5 : 1,
              cursor: saving || !ssidForm.ssid ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving...' : 'Save SSID'}
            </button>
          </SectionCard>
        </div>
      )}

      {/* WiFi Networks List */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard title="WiFi Networks" icon={<WifiHigh size={17} weight="duotone" color={GOLD} />}>
          {networks.length === 0 ? (
            <PremiumEmpty
              icon={<WifiHigh size={30} weight="duotone" color={GOLD} />}
              title="No SSIDs configured yet"
              description="Add your first wireless network to start planning coverage and access."
              action={<button onClick={() => setShowSsidForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add SSID</button>}
              compact
            />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {networks.map(net => {
                const sc = SECURITY_COLORS[net.security_type] || SECURITY_COLORS.wpa2_personal;
                return (
                  <div key={net.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 22, display: 'inline-flex', alignItems: 'center' }}><WifiHigh size={22} weight="regular" color={TEXT} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>
                        {net.ssid}
                        {net.hidden && <span style={{ fontSize: 10, color: DIM, marginLeft: 8 }}>(Hidden)</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                          background: sc.bg, color: sc.text,
                        }}>{net.security_type.replace(/_/g, ' ').toUpperCase()}</span>
                        {net.vlan_name && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>VLAN: {net.vlan_name}</span>}
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>{net.band.toUpperCase()}</span>
                        {net.client_isolation && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: `${GOLD}15`, color: GOLD }}>Isolated</span>}
                        {net.bandwidth_limit_mbps > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: DIM }}>{net.bandwidth_limit_mbps} Mbps</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>{net.client_count ?? 0}</div>
                      <div style={{ color: DIM, fontSize: 10 }}>clients</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Signal Studio hand-off — coverage design lives in the real engine, not a sketch */}
      <div style={{ marginBottom: 24 }}>
        <SectionCard
          title="Coverage Design"
          icon={<MapTrifold size={17} weight="duotone" color={GOLD} />}
        >
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
            padding: '18px 20px', borderRadius: 12, border: '1px solid rgba(245,184,77,0.28)',
            background: 'linear-gradient(160deg, rgba(245,158,11,0.08), rgba(255,255,255,0.02))',
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(245,184,77,0.12)', border: '1px solid rgba(245,184,77,0.45)',
            }}>
              <Broadcast size={24} weight="duotone" color="#F5B84D" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ color: TEXT, fontSize: 15, fontWeight: 800 }}>Design this floor in Signal Studio</div>
              <div style={{ color: DIM, fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
                Physics-based RF propagation over your real floor plan — walls, materials, AP placement, and a priced bid when you approve.
              </div>
            </div>
            <Link href={`/app/signal-studio?projectId=${projectId}`} className="pmBtn" style={{ ...goldButtonStyle, textDecoration: 'none' }}>
              Open Signal Studio <ArrowUpRight size={15} weight="bold" />
            </Link>
          </div>

          {designs.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: DIM, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Saved designs for this project
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {designs.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${BORDER}`,
                  }}>
                    <MapTrifold size={16} weight="duotone" color="#F5B84D" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: TEXT, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                        {d.device_count} device{d.device_count === 1 ? '' : 's'}
                        {typeof d.coverage_percent === 'number' ? ` · ${Math.round(d.coverage_percent)}% predicted coverage` : ''}
                        {` · updated ${new Date(d.updated_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Access Points — inventory only; placement + coverage modeling happen in Signal Studio */}
      <SectionCard
        title="Access Points"
        icon={<Broadcast size={17} weight="duotone" color={GOLD} />}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={selectedFloor} onChange={e => setSelectedFloor(+e.target.value)} style={{ ...inputStyle, width: 120 }}>
              {[1, 2, 3, 4, 5].map(f => <option key={f} value={f}>Floor {f}</option>)}
            </select>
            <button
              onClick={() => { setApForm({ ...apForm, floor: selectedFloor }); setShowApForm(!showApForm); }}
              style={{
                padding: '8px 14px', background: 'rgba(255,255,255,0.05)',
                color: TEXT, border: `1px solid ${BORDER}`,
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {showApForm ? 'Close Form' : 'Add AP'}
            </button>
          </div>
        }
      >
        {/* Add AP Form */}
        {showApForm && (
          <div style={{ marginBottom: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${BORDER}` }}>
            <h4 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Configure Access Point</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>AP Name *</label>
                <input value={apForm.name} onChange={e => setApForm({ ...apForm, name: e.target.value })} placeholder="AP-F1-01" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={apForm.model} onChange={e => setApForm({ ...apForm, model: e.target.value })} placeholder="U6-Pro" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Floor</label>
                <input type="number" min={1} value={apForm.floor} onChange={e => setApForm({ ...apForm, floor: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Channel</label>
                <input type="number" value={apForm.channel} onChange={e => setApForm({ ...apForm, channel: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Power (dBm)</label>
                <input type="number" value={apForm.power_dbm} onChange={e => setApForm({ ...apForm, power_dbm: +e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={handleApSubmit} disabled={saving || !apForm.name} className="pmBtn" style={{
                ...goldButtonStyle,
                opacity: saving || !apForm.name ? 0.5 : 1,
                cursor: saving || !apForm.name ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving...' : 'Save AP'}
              </button>
              <button onClick={() => setShowApForm(false)} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </div>
        )}

        {/* AP List */}
        {aps.length > 0 ? (
          <div>
            <div style={{ color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>ACCESS POINTS ({aps.filter(a => a.floor === selectedFloor).length} on Floor {selectedFloor})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {aps.filter(a => a.floor === selectedFloor).map(ap => (
                <div key={ap.id} style={{
                  padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ap.status === 'online' ? GREEN : ap.status === 'offline' ? RED : '#6B7280' }} />
                    <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{ap.name}</span>
                  </div>
                  <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>
                    {ap.model || 'Unknown'} &middot; Ch {ap.channel} &middot; {ap.power_dbm}dBm
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <PremiumEmpty
            icon={<Broadcast size={30} weight="duotone" color={GOLD} />}
            title="No access points logged yet"
            description="Track installed APs here, or design the placement first in Signal Studio."
            action={<Link href={`/app/signal-studio?projectId=${projectId}`} className="pmBtn" style={{ ...goldButtonStyle, textDecoration: 'none' }}><ArrowUpRight size={15} weight="bold" /> Open Signal Studio</Link>}
            compact
          />
        )}
      </SectionCard>
      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
