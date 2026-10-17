'use client';
/**
 * Network — the job's low-voltage / IT network at a glance: device, VLAN,
 * cabling and alert counts, a readiness checklist computed from the live
 * inventory, the site profile, and every device on the job.
 *
 * Reads  GET  /api/network/projects?projectId=     (the job's network module)
 *        GET  /api/network/devices|vlans|cables|alerts?networkProjectId=
 * Writes POST /api/network/projects                 (first-time setup)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Card, DataTable, EmptyState, Menu, Field, Input, Select, FormGrid,
  DetailList, ItemList, ItemRow, Callout, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { Facts } from '@/lib/ui/filled-facts';
import {
  Globe, ArrowsLeftRight, Shield, WifiHigh, Printer, VideoCamera, HardDrives, Laptop, Phone, Plug,
  CellSignalFull, BatteryFull, Package, Robot, Devices, Shuffle, ChartBar, Plus, CheckCircle, Warning,
  Circle, WarningCircle, Info, ArrowSquareOut, type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import NetworkTabs, { networkCrumbs, networkHref } from './_components/NetworkTabs';

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

const DEVICE_TYPE_ICONS: Record<string, PhosphorIcon> = {
  router: Globe, switch: ArrowsLeftRight, firewall: Shield, access_point: WifiHigh,
  printer: Printer, camera: VideoCamera, server: HardDrives, workstation: Laptop,
  voip_phone: Phone, iot: Plug, modem: CellSignalFull, ups: BatteryFull,
};

const SITE_TYPES = [
  { value: 'commercial_office', label: 'Commercial Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'medical', label: 'Medical / Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'residential_mdu', label: 'Residential MDU' },
  { value: 'mixed_use', label: 'Mixed Use' },
];

const cap = (s: string) => { const t = (s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

function deviceTone(s: string): BadgeTone {
  if (s === 'online') return 'ongoing';
  if (s === 'offline') return 'overdue';
  if (s === 'warning' || s === 'maintenance') return 'lead';
  if (s === 'planned') return 'closed';
  return 'neutral';
}

function TypeIcon({ type }: { type: string }) {
  const I = DEVICE_TYPE_ICONS[type] || Package;
  return <I size={15} />;
}

export default function NetworkDashboard() {
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();
  const [networkProject, setNetworkProject] = useState<NetworkProject | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [cables, setCables] = useState<CableRun[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ site_type: 'commercial_office', total_sq_ft: 5000, floor_count: 1 });
  const [creating, setCreating] = useState(false);
  const [setupError, setSetupError] = useState('');
  const { toast, show } = useToast();
  const { ctx } = useProjectContext(projectId);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
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
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the network");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSetup = async () => {
    setCreating(true);
    setSetupError('');
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
        show('Network module set up');
      } else {
        setSetupError(data.error || "Couldn't set up the network module.");
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Couldn't set up the network module.");
    }
    setCreating(false);
  };

  const testedCables = cables.filter(c => c.tested).length;
  const passedCables = cables.filter(c => c.test_result === 'pass').length;
  const openAlerts = alerts.filter(a => !a.resolved);
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const siteType = (networkProject?.site_type || 'site').replace(/_/g, ' ');
  const sqFt = (networkProject?.total_sq_ft || 0).toLocaleString();
  const floors = networkProject?.floor_count || 1;
  const crumbs = networkCrumbs(projectId, ctx?.project?.name);

  if (showSetup) {
    return (
      <PageShell crumbs={crumbs} title="Network" subtitle={ctx?.project?.name || undefined}>
        <Card title="Set up the network module">
          <FormGrid cols={3}>
            <Field label="Site type">
              <Select value={setupForm.site_type} onChange={e => setSetupForm({ ...setupForm, site_type: e.target.value })} options={SITE_TYPES} />
            </Field>
            <Field label="Square footage">
              <Input type="number" value={setupForm.total_sq_ft} onChange={e => setSetupForm({ ...setupForm, total_sq_ft: +e.target.value })} />
            </Field>
            <Field label="Floor count">
              <Input type="number" value={setupForm.floor_count} onChange={e => setSetupForm({ ...setupForm, floor_count: +e.target.value })} />
            </Field>
          </FormGrid>
          {setupError && <div style={{ marginTop: 12 }}><Callout tone="danger" icon={<WarningCircle size={16} />} title="Setup failed" text={setupError} /></div>}
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={handleSetup} disabled={creating}>
              {creating ? 'Creating…' : 'Set up network module'}
            </Button>
          </div>
        </Card>
        <Toast message={toast?.message ?? null} tone={toast?.tone} />
      </PageShell>
    );
  }

  const stats: StatItem[] = [
    { label: 'Devices', value: loading ? '—' : String(devices.length), sub: loading ? undefined : `${onlineCount} online`, icon: <Devices size={15} />, href: networkHref(projectId, 'devices') },
    { label: 'Online', value: loading ? '—' : String(onlineCount), sub: loading ? undefined : `Of ${devices.length} total`, tone: onlineCount ? 'good' : 'default', icon: <Circle size={15} /> },
    { label: 'VLANs', value: loading ? '—' : String(vlans.length), icon: <Shuffle size={15} />, href: networkHref(projectId, 'vlans') },
    { label: 'Cable runs tested', value: loading ? '—' : `${testedCables}/${cables.length}`, sub: loading ? undefined : cables.length > 0 ? `${Math.round((passedCables / Math.max(testedCables, 1)) * 100)}% pass rate` : 'No runs yet', icon: <Plug size={15} />, href: networkHref(projectId, 'cables') },
    { label: 'Open alerts', value: loading ? '—' : String(openAlerts.length), tone: openAlerts.length ? 'bad' : 'good', icon: <Warning size={15} /> },
  ];

  const readiness = [
    { key: 'cfg', done: true, title: 'Module configured', desc: `${cap(siteType)} · ${sqFt} SF · ${floors} floor${floors > 1 ? 's' : ''}`, href: undefined as string | undefined },
    { key: 'dev', done: devices.length > 0, title: 'Device inventory', desc: devices.length > 0 ? `${devices.length} device${devices.length === 1 ? '' : 's'} · ${onlineCount} online` : 'No devices yet', href: networkHref(projectId, 'devices') },
    { key: 'vlan', done: vlans.length > 0, title: 'Network segmented', desc: vlans.length > 0 ? `${vlans.length} VLAN${vlans.length === 1 ? '' : 's'} defined` : 'No VLANs yet', href: networkHref(projectId, 'vlans') },
    { key: 'cab', done: cables.length > 0 && testedCables === cables.length, title: 'Cabling tested', desc: cables.length > 0 ? `${testedCables}/${cables.length} runs tested · ${passedCables} passed` : 'No cable runs yet', href: networkHref(projectId, 'cables') },
    { key: 'alr', done: openAlerts.length === 0, title: 'Alerts clear', desc: openAlerts.length > 0 ? `${openAlerts.length} open alert${openAlerts.length === 1 ? '' : 's'}` : 'No open alerts', href: undefined },
  ];

  const columns: Column<Device>[] = [
    { key: 'hostname', header: 'Hostname', primary: true, phone: 'show', render: (d) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TypeIcon type={d.device_type} />{d.hostname}</span> },
    { key: 'device_type', header: 'Type', accessor: (d) => cap(d.device_type), render: (d) => cap(d.device_type) },
    { key: 'ip_address', header: 'IP address', phone: 'show', render: (d) => d.ip_address ? <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{d.ip_address}</span> : '—' },
    { key: 'location', header: 'Location', render: (d) => d.location || null },
    { key: 'status', header: 'Status', phone: 'show', render: (d) => <Badge tone={deviceTone(d.status)} dot>{cap(d.status || 'planned')}</Badge> },
  ];

  return (
    <PageShell
      crumbs={crumbs}
      title="Network"
      subtitle={networkProject ? `${cap(siteType)} · ${sqFt} SF · ${floors} floor${floors > 1 ? 's' : ''}` : (ctx?.project?.name || undefined)}
      actions={
        <>
          <Menu
            triggerLabel="Add"
            triggerIcon={<Plus size={15} />}
            actions={[
              { label: 'Add device', icon: <Devices size={14} />, href: networkHref(projectId, 'devices') },
              { label: 'Add VLAN', icon: <Shuffle size={14} />, href: networkHref(projectId, 'vlans') },
              { label: 'Add cable run', icon: <Plug size={14} />, href: networkHref(projectId, 'cables') },
              { label: 'Generate report', icon: <ChartBar size={14} />, href: networkHref(projectId, 'reports') },
            ]}
          />
          <Button variant="primary" icon={<Robot size={15} weight="fill" />} onClick={() => router.push(networkHref(projectId, 'wizard'))}>AI Network Wizard</Button>
        </>
      }
    >
      <NetworkTabs projectId={projectId} value="overview" />

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the network" text={loadError} action={<Button onClick={fetchAll}>Try again</Button>} />
      ) : (
        <>
          <StatRow items={stats} />

          {openAlerts.length > 0 && (
            <Card title="Open alerts" icon={<Warning size={16} />} flush>
              <ItemList>
                {openAlerts.map(alert => (
                  <ItemRow
                    key={alert.id}
                    icon={alert.severity === 'critical' ? <WarningCircle size={16} weight="fill" /> : alert.severity === 'warning' ? <Warning size={16} weight="fill" /> : <Info size={16} weight="fill" />}
                    tone={alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'info'}
                    title={alert.message}
                    desc={new Date(alert.created_at).toLocaleString()}
                  />
                ))}
              </ItemList>
            </Card>
          )}

          {!loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--section-gap)', alignItems: 'start' }}>
              <Card title="Readiness" icon={<CheckCircle size={16} />} flush>
                <ItemList>
                  {readiness.map(r => (
                    <ItemRow
                      key={r.key}
                      icon={r.done ? <CheckCircle size={16} weight="fill" /> : <Circle size={16} />}
                      tone={r.done ? 'success' : 'neutral'}
                      title={r.title}
                      desc={r.desc}
                      href={r.href}
                    />
                  ))}
                </ItemList>
              </Card>
              <Card title="Site profile" icon={<Globe size={16} />}>
                <Facts items={[
                  ['Site type', cap(siteType)],
                  ['Square footage', `${sqFt} SF`],
                  ['Floors', String(floors)],
                  ['Devices per 1k SF', networkProject?.total_sq_ft ? (devices.length / (networkProject.total_sq_ft / 1000)).toFixed(1) : '—'],
                  ...(ctx?.project?.address ? [['Address', ctx.project.address] as [string, React.ReactNode]] : []),
                ]} />
              </Card>
            </div>
          )}

          <DataTable<Device>
            tableId="project-network-devices-overview"
            exportName="network-devices"
            columns={columns}
            rows={devices}
            loading={loading}
            rowKey={(d) => d.id}
            defaultSort={{ key: 'device_type', dir: 'asc' }}
            onRowClick={(d) => router.push(`${networkHref(projectId, 'devices')}?selected=${d.id}`)}
            rowActions={(d) => [{ label: 'Open', icon: <ArrowSquareOut size={14} />, href: `${networkHref(projectId, 'devices')}?selected=${d.id}` }]}
            empty={
              <EmptyState
                icon={<Devices size={22} />}
                title="No devices added yet"
                text={`Add devices by hand, or let the AI wizard draft the full design for this ${siteType}.`}
                action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} href={networkHref(projectId, 'devices')}>Add your first device</Button>}
              />
            }
          />
        </>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
