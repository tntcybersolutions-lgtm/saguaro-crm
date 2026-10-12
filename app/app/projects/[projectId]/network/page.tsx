'use client';

import { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Globe, ArrowsLeftRight, Shield, WifiHigh, Printer, VideoCamera, HardDrives, Laptop, Phone, Plug, CellSignalFull, BatteryFull, Package, Robot, Devices, Shuffle, Gear, ChartBar, Plus, CheckCircle, Warning, Circle, WarningCircle, Info, Lightning, SquaresFour } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, IconChip, StatStrip, FlowSteps, InsightRow, goldButtonStyle, railStyle } from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';

const GOLD = 'var(--brand-primary)';
const GREEN = 'var(--success)';
const BLUE = 'var(--brand-primary)';
const RED = '#F87171';
const TEXT = 'var(--text-primary)';
// Premium kit surface tokens (match components/ui/premium.tsx) ------------------
const WHITE = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const KIT_BORDER = 'rgba(255,255,255,0.08)';
const KIT_SURFACE = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';

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

const DEVICE_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  router: Globe, switch: ArrowsLeftRight, firewall: Shield, access_point: WifiHigh,
  printer: Printer, camera: VideoCamera, server: HardDrives, workstation: Laptop,
  voip_phone: Phone, iot: Plug, modem: CellSignalFull, ups: BatteryFull,
};

const STATUS_COLORS: Record<string, string> = {
  online: GREEN, offline: RED, planned: 'var(--status-closed)', warning: 'var(--warning)',
};

const NAV_ITEMS = [
  { label: 'Devices', href: 'devices', icon: Devices, desc: 'Device inventory' },
  { label: 'VLANs', href: 'vlans', icon: Shuffle, desc: 'VLAN management' },
  { label: 'Cables', href: 'cables', icon: Plug, desc: 'Cable schedule' },
  { label: 'Firewall', href: 'firewall', icon: Shield, desc: 'Firewall rules' },
  { label: 'WiFi', href: 'wifi', icon: WifiHigh, desc: 'WiFi & Signal Studio' },
  { label: 'Config', href: 'config', icon: Gear, desc: 'Config generator' },
  { label: 'Wizard', href: 'wizard', icon: Robot, desc: 'AI network wizard' },
  { label: 'Reports', href: 'reports', icon: ChartBar, desc: 'Reports & exports' },
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
  // Project snapshot — names the job in the hero and grounds the setup screen.
  const { ctx } = useProjectContext(projectId);

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

  // Premium input styling shared by the setup form fields.
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
    color: TEXT, border: `1px solid ${KIT_BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
  };

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  if (showSetup) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleHero
          eyebrow={ctx?.project?.name || 'Network Hub'}
          eyebrowIcon={<Globe size={13} weight="fill" color="var(--text-secondary)" />}
          title="Low-Voltage &"
          accent="IT Network"
          subtitle="Design, document, and certify this building's network."
        />
        {ctx && (
          <div style={{ maxWidth: 2200 }}>
            <StatStrip items={[
              {href: `/app/projects/${projectId}/network`,  label: 'Project', value: ctx.project?.name || '—', sub: ctx.project?.projectNumber ? `#${ctx.project.projectNumber}` : (ctx.project?.status || 'active') },
              {href: `/app/projects/${projectId}/network`,  label: 'Site Address', value: ctx.project?.address || '—', sub: 'The network documents against this site' },
              {href: `/app/projects/${projectId}/network`,  label: 'Subs On the Job', value: String((ctx.subs || []).length), sub: 'Coordinate low-volt rough-in' },
              {href: `/app/projects/${projectId}/network`,  label: 'Open RFIs', value: String(Number(ctx.counts?.openRfis) || 0), sub: 'Design questions in flight' },
              {href: `/app/projects/${projectId}/network`,  label: 'Schedule Tasks', value: String(Number(ctx.counts?.scheduleTasks) || 0), sub: Number(ctx.schedule?.criticalCount) ? `${ctx.schedule.criticalCount} critical` : 'Plan cable pulls around them' },
            ]} />
          </div>
        )}
        <div className="pmSplit" style={railStyle(360, { gap: 22, alignItems: 'start', maxWidth: 2200 })}>
          <SectionCard
            icon={<Globe size={18} weight="duotone" color="var(--text-secondary)" />}
            title="Set Up Network Module"
            subtitle={ctx?.project?.name ? `Configure the low voltage / IT network for ${ctx.project.name}.` : 'Configure your low voltage / IT network for this project.'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ color: MUTED, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Site Type</label>
                <select
                  value={setupForm.site_type}
                  onChange={e => setSetupForm({ ...setupForm, site_type: e.target.value })}
                  style={inputStyle}
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
                <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 }}>Sets wizard defaults — VLAN plan, device density, and WiFi coverage targets.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: MUTED, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Square Footage</label>
                  <input
                    type="number"
                    value={setupForm.total_sq_ft}
                    onChange={e => setSetupForm({ ...setupForm, total_sq_ft: +e.target.value })}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 }}>Drives AP counts and cable-run estimates.</div>
                </div>
                <div>
                  <label style={{ color: MUTED, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Floor Count</label>
                  <input
                    type="number"
                    value={setupForm.floor_count}
                    onChange={e => setSetupForm({ ...setupForm, floor_count: +e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button
                onClick={handleSetup}
                disabled={creating}
                className="pmBtn"
                style={{ ...goldButtonStyle, width: '100%', opacity: creating ? 0.6 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
              >
                {creating ? 'Creating…' : 'Set Up Network Module'}
              </button>
            </div>
          </SectionCard>
          <SectionCard flat icon={<Robot size={17} weight="duotone" color="var(--text-secondary)" />} title="What You Get">
            <FlowSteps title="" steps={[
              { title: 'AI Network Wizard', desc: 'Describe the site — the wizard drafts the device list, VLAN plan, and IP scheme.' },
              { title: 'Device & VLAN Inventory', desc: 'Every switch, AP, and camera tracked with IP, MAC, VLAN, and location.' },
              { title: 'Cable Schedule & Testing', desc: 'Label every run, log certification results, and watch the pass rate climb.' },
              { title: 'Signal Studio & Reports', desc: 'Physics-based coverage design in Signal Studio, plus client-ready closeout documentation.' },
            ]} />
          </SectionCard>
        </div>
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Network Hub'}
        eyebrowIcon={<Globe size={13} weight="fill" color="var(--text-secondary)" />}
        title="Network"
        accent="Dashboard"
        subtitle={
          <>
            {networkProject?.site_type?.replace(/_/g, ' ')} &middot; {networkProject?.total_sq_ft?.toLocaleString()} SF &middot; {networkProject?.floor_count} floor{(networkProject?.floor_count || 1) > 1 ? 's' : ''}
          </>
        }
        actions={
          <button
            onClick={() => router.push(`/app/projects/${projectId}/network/wizard`)}
            className="pmBtn"
            style={goldButtonStyle}
          >
            <Robot size={16} weight="fill" color="var(--on-brand)" /> AI Network Wizard
          </button>
        }
      />

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={<Devices size={19} weight="duotone" color="var(--text-secondary)" />} label="Total Devices" value={String(devices.length)} accent={BLUE} delay={0.02}  href={`/app/projects/${projectId}/network/devices`}/>
        <StatCard icon={<Circle size={19} weight="duotone" color={GREEN} />} label="Online" value={String(devices.filter(d => d.status === 'online').length)} accent={GREEN} sub={`Of ${devices.length} total`} delay={0.06}  href={`/app/projects/${projectId}/network`}/>
        <StatCard icon={<Shuffle size={19} weight="duotone" color="var(--warning)" />} label="VLANs" value={String(vlans.length)} accent="var(--warning)" delay={0.10}  href={`/app/projects/${projectId}/network/vlans`}/>
        <StatCard icon={<Plug size={19} weight="duotone" color="var(--text-secondary)" />} label="Cable Runs" value={`${testedCables}/${cables.length}`} accent={GOLD} sub="Tested" delay={0.14}  href={`/app/projects/${projectId}/network/cables`}/>
        <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN} />} label="Pass Rate" value={cables.length > 0 ? `${Math.round((passedCables / Math.max(testedCables, 1)) * 100)}%` : 'N/A'} accent={GREEN} delay={0.18}  href={`/app/projects/${projectId}/network`}/>
        <StatCard icon={<Warning size={19} weight="duotone" color={openAlerts > 0 ? RED : GREEN} />} label="Open Alerts" value={String(openAlerts)} accent={openAlerts > 0 ? RED : GREEN} delay={0.22}  href={`/app/projects/${projectId}/network`}/>
      </div>

      {/* Quick Actions + modules, with a live readiness rail */}
      <div className="pmSplit" style={railStyle(340, { gap: 22, alignItems: 'start', marginBottom: 24 })}>
      <div style={{ minWidth: 0 }}>
      {/* Quick Actions */}
      <SectionCard
        icon={<Lightning size={17} weight="duotone" color="var(--text-secondary)" />}
        title="Quick Actions"
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'Add Device', href: `devices`, icon: Plus },
            { label: 'Add VLAN', href: `vlans`, icon: Shuffle },
            { label: 'Add Cable Run', href: `cables`, icon: Plug },
            /* "Scan Network" (#scan) and "Ask Sage" (#sage) were removed: both
               rendered as <Link href="#"> with no target on the page, so they
               were dead clicks. A button that does nothing costs more trust
               than the feature would have earned. The AI Network Wizard above
               is the working path to the same job. */
            { label: 'Generate Report', href: `reports`, icon: ChartBar },
          ].map(action => (
            <Link
              key={action.label}
              href={action.href.startsWith('#') ? '#' : `/app/projects/${projectId}/network/${action.href}`}
              className="pmBtn"
              style={{
                padding: '9px 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${KIT_BORDER}`,
                borderRadius: 10, color: 'var(--c-text-2)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              <action.icon size={16} weight="bold" color="var(--text-secondary)" /> {action.label}
            </Link>
          ))}
        </div>
      </SectionCard>

      {/* Navigation Grid */}
      <SectionCard
        icon={<SquaresFour size={17} weight="duotone" color="var(--text-secondary)" />}
        title="Network Modules"
        style={{ marginBottom: 32 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={`/app/projects/${projectId}/network/${item.href}`}
              className="pmHover"
              style={{
                display: 'block', textDecoration: 'none', height: '100%',
                background: KIT_SURFACE, border: `1px solid ${KIT_BORDER}`, borderRadius: 16,
                padding: '18px 20px',
                boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <IconChip size={40}><item.icon size={20} weight="duotone" color="var(--text-secondary)" /></IconChip>
              <div style={{ color: WHITE, fontSize: 15, fontWeight: 800, marginTop: 12 }}>{item.label}</div>
              <div style={{ color: MUTED, fontSize: 13, marginTop: 3 }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </SectionCard>
      </div>

      {/* Readiness rail — derived from the live inventory */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard flat icon={<CheckCircle size={17} weight="duotone" color="var(--text-secondary)" />} title="Network Readiness">
          <FlowSteps title="" steps={[
            { title: 'Module Configured', done: true, desc: `${(networkProject?.site_type || 'site').replace(/_/g, ' ')} · ${(networkProject?.total_sq_ft || 0).toLocaleString()} SF · ${networkProject?.floor_count || 1} floor${(networkProject?.floor_count || 1) > 1 ? 's' : ''}.` },
            { title: 'Device Inventory', done: devices.length > 0, desc: devices.length > 0 ? `${devices.length} device${devices.length === 1 ? '' : 's'} — ${devices.filter(d => d.status === 'online').length} online.` : 'Add devices by hand, or let the AI wizard draft the design.' },
            { title: 'Network Segmented', done: vlans.length > 0, desc: vlans.length > 0 ? `${vlans.length} VLAN${vlans.length === 1 ? '' : 's'} defined.` : 'Define VLANs to separate voice, data, cameras, and guests.' },
            { title: 'Cabling Tested', done: cables.length > 0 && testedCables === cables.length, desc: cables.length > 0 ? `${testedCables}/${cables.length} runs tested — ${passedCables} passed.` : 'Log cable runs, then record results as you certify.' },
            { title: 'Alerts Clear', done: openAlerts === 0, desc: openAlerts > 0 ? `${openAlerts} open alert${openAlerts === 1 ? '' : 's'} below need attention.` : 'No open alerts on this network.' },
          ]} />
        </SectionCard>
        <SectionCard flat icon={<Globe size={17} weight="duotone" color="var(--text-secondary)" />} title="Site Profile">
          <InsightRow label="Site Type" value={(networkProject?.site_type || '—').replace(/_/g, ' ')} />
          <InsightRow label="Square Footage" value={`${(networkProject?.total_sq_ft || 0).toLocaleString()} SF`} />
          <InsightRow label="Floors" value={String(networkProject?.floor_count || 1)} />
          <InsightRow label="Devices per 1k SF" value={networkProject?.total_sq_ft ? (devices.length / (networkProject.total_sq_ft / 1000)).toFixed(1) : '—'} />
          {ctx?.project?.address && <InsightRow label="Address" value={ctx.project.address} />}
        </SectionCard>
      </div>
      </div>

      {/* Devices by Type */}
      <SectionCard
        icon={<Devices size={17} weight="duotone" color="var(--text-secondary)" />}
        title="Devices by Type"
        style={{ marginBottom: 24 }}
      >
        {Object.keys(devicesByType).length === 0 ? (
          <PremiumEmpty
            icon={<Devices size={30} weight="duotone" color="var(--text-secondary)" />}
            title="No devices added yet"
            description={`This ${(networkProject?.site_type || 'site').replace(/_/g, ' ')} covers ${(networkProject?.total_sq_ft || 0).toLocaleString()} SF — add devices by hand, or let the AI wizard draft the full design in one pass.`}
            action={<Link href={`/app/projects/${projectId}/network/devices`} className="pmBtn" style={goldButtonStyle}><Plus size={15} weight="bold" color="var(--on-brand)" /> Add Your First Device</Link>}
            compact
          />
        ) : (
          Object.entries(devicesByType).map(([type, devs]) => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>{(() => { const Icon = DEVICE_TYPE_ICONS[type] || Package; return <Icon size={18} weight="duotone" color="var(--text-secondary)" />; })()}</span>
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</span>
                <span style={{
                  background: 'rgba(255,255,255,0.08)', color: MUTED, fontSize: 12, padding: '2px 8px',
                  borderRadius: 10, fontWeight: 700,
                }}>{devs.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                {devs.map(dev => (
                  <Link
                    key={dev.id}
                    href={`/app/projects/${projectId}/network/devices?selected=${dev.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${KIT_BORDER}`,
                      textDecoration: 'none', transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--brand-primary) 45%, transparent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = KIT_BORDER; }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: STATUS_COLORS[dev.status] || 'var(--status-closed)',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.hostname}</div>
                      <div style={{ color: MUTED, fontSize: 12 }}>{dev.ip_address || 'No IP'} &middot; {dev.location || 'No location'}</div>
                    </div>
                    <span style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: `color-mix(in srgb, ${STATUS_COLORS[dev.status] || 'var(--status-closed)'} 13%, transparent)`,
                      color: STATUS_COLORS[dev.status] || 'var(--status-closed)',
                      textTransform: 'capitalize',
                    }}>{dev.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </SectionCard>

      {/* Open Alerts */}
      {alerts.filter(a => !a.resolved).length > 0 && (
        <SectionCard flat
          icon={<Warning size={17} weight="duotone" color={RED} />}
          title="Open Alerts"
          accent={RED}
        >
          {alerts.filter(a => !a.resolved).map(alert => (
            <div key={alert.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: alert.severity === 'critical' ? `${RED}18` : 'rgba(255,255,255,0.03)',
              borderRadius: 10, border: `1px solid ${alert.severity === 'critical' ? `${RED}44` : KIT_BORDER}`,
              marginBottom: 6,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>{alert.severity === 'critical' ? <WarningCircle size={16} weight="fill" color={RED} /> : alert.severity === 'warning' ? <Warning size={16} weight="fill" color="var(--text-secondary)" /> : <Info size={16} weight="fill" color="var(--text-secondary)" />}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 13 }}>{alert.message}</div>
                <div style={{ color: MUTED, fontSize: 12 }}>{new Date(alert.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
