'use client';
/**
 * Network › AI Wizard — describe the site, let the AI draft the network
 * (VLANs, equipment, IP scheme, firewall, SSIDs, cable estimate), then apply
 * the whole design to the job's network module.
 *
 * Reads  GET  /api/network/projects?projectId=
 * Writes POST /api/ai/network-wizard        (SSE stream, or JSON fallback)
 *        POST /api/network/wizard/apply     { network_project_id, result }
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Card, DataTable, Field, Input, Select, FormGrid, FormSection,
  ItemList, ItemRow, Callout, Toast, useToast,
  type Column, type StatItem,
} from '@/components/ui/kit';
import {
  Robot, Gear, CheckCircle, SlidersHorizontal, Sparkle, TreeStructure, Package, Globe, ShieldCheck, Path, Ruler,
  CurrencyDollar, WifiHigh, WarningCircle,
} from '@phosphor-icons/react';
import NetworkTabs, { networkCrumbs } from '../_components/NetworkTabs';

interface WizardResult {
  vlans: Array<{ vlan_id: number; name: string; subnet: string; gateway: string; purpose: string }>;
  equipment: Array<{ type: string; manufacturer: string; model: string; quantity: number; unit_cost: number; total_cost: number }>;
  ip_scheme: Array<{ vlan: string; subnet: string; gateway: string; dhcp_range: string; reserved: string }>;
  firewall_rules: Array<{ name: string; action: string; source: string; destination: string; port: string; protocol: string }>;
  wifi_ssids: Array<{ ssid: string; security: string; vlan: string; band: string; purpose: string }>;
  cable_estimate: { cat6_runs: number; cat6a_runs: number; fiber_runs: number; total_length_ft: number; estimated_cost: number };
  total_equipment_cost: number;
  summary: string;
}

type Indexed<T> = T & { _i: number };
const indexed = <T,>(rows: T[] | undefined): Indexed<T>[] => (rows || []).map((r, i) => ({ ...r, _i: i }));

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

const MANUFACTURERS = ['cisco', 'ubiquiti', 'meraki', 'aruba', 'fortinet'];
const cap = (s: string) => { const t = (s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

const COUNT_FIELDS = [
  { key: 'workstations', label: 'Workstations' },
  { key: 'phones', label: 'VoIP phones' },
  { key: 'printers', label: 'Printers' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'access_points', label: 'Access points' },
  { key: 'iot_devices', label: 'IoT devices' },
] as const;

const CSS = `
.netWizStream { max-height: 400px; overflow: auto; }
.netWizStream pre { color: var(--text-primary); font-size: 13px; white-space: pre-wrap; font-family: inherit; line-height: 1.6; margin: 0; }
.netWizChecks { display: flex; gap: 16px; flex-wrap: wrap; grid-column: 1 / -1; }
.netWizChecks label { display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-size: 14px; cursor: pointer; min-height: 44px; }
@keyframes netWizSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.netWizSpin { display: inline-flex; animation: netWizSpin 1s linear infinite; }
`;

export default function NetworkWizardPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<WizardResult | null>(null);
  const [streamText, setStreamText] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    site_type: 'commercial_office',
    square_footage: 10000,
    floor_count: 1,
    workstations: 20,
    phones: 20,
    printers: 4,
    cameras: 8,
    access_points: 4,
    guest_wifi: true,
    voip: true,
    iot_devices: 0,
    manufacturer: 'ubiquiti',
    budget_min: 0,
    budget_max: 0,
  });

  useEffect(() => {
    fetch(`/api/network/projects?projectId=${projectId}`)
      .then(r => r.json())
      .then(d => { if (d.networkProject) setNetworkProjectId(d.networkProject.id); })
      .catch(() => { /* no module yet — Apply stays unavailable until one exists */ });
  }, [projectId]);

  const generateDesign = async () => {
    setGenerating(true);
    setResult(null);
    setStreamText('');
    setApplied(false);

    try {
      const res = await fetch('/api/ai/network-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ...form, network_project_id: networkProjectId }),
      });

      if (!res.body) {
        // Non-streaming fallback
        const data = await res.json();
        setResult(data.result || data);
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.result) {
                setResult(parsed.result);
              } else if (parsed.text) {
                fullText += parsed.text;
                setStreamText(fullText);
              } else if (parsed.chunk) {
                fullText += parsed.chunk;
                setStreamText(fullText);
              }
            } catch {
              fullText += data;
              setStreamText(fullText);
            }
          }
        }
        if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
      }
    } catch {
      setStreamText('Error generating design. Please try again.');
    }
    setGenerating(false);
  };

  const applyAll = async () => {
    if (!result || !networkProjectId) return;
    setApplying(true);
    try {
      const res = await fetch('/api/network/wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network_project_id: networkProjectId, result }),
      });
      if (res.ok) { setApplied(true); show('Design applied to the job'); }
      else show("Couldn't apply the design", 'bad');
    } catch {
      show("Couldn't apply the design", 'bad');
    }
    setApplying(false);
  };

  const num = (k: keyof typeof form) => form[k] as number;

  const vlanCols: Column<Indexed<WizardResult['vlans'][number]>>[] = [
    { key: 'vlan_id', header: 'VLAN', width: 90, phone: 'show', render: (v) => <strong style={mono}>{v.vlan_id}</strong>, groupable: false },
    { key: 'name', header: 'Name', primary: true, phone: 'show' },
    { key: 'subnet', header: 'Subnet', phone: 'show', render: (v) => <span style={mono}>{v.subnet}</span> },
    { key: 'gateway', header: 'Gateway', render: (v) => <span style={mono}>{v.gateway}</span> },
    { key: 'purpose', header: 'Purpose', render: (v) => <Badge>{cap(v.purpose)}</Badge> },
  ];
  const equipCols: Column<Indexed<WizardResult['equipment'][number]>>[] = [
    { key: 'type', header: 'Type', primary: true, phone: 'show', accessor: (e) => cap(e.type) },
    { key: 'manufacturer', header: 'Manufacturer', accessor: (e) => cap(e.manufacturer) },
    { key: 'model', header: 'Model' },
    { key: 'quantity', header: 'Qty', align: 'right', total: 'sum', phone: 'show' },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', format: fmt$, render: (e) => fmt$(e.unit_cost) },
    { key: 'total_cost', header: 'Total', align: 'right', total: 'sum', format: fmt$, phone: 'show', render: (e) => <strong>{fmt$(e.total_cost)}</strong> },
  ];
  const ipCols: Column<Indexed<WizardResult['ip_scheme'][number]>>[] = [
    { key: 'vlan', header: 'VLAN', primary: true, phone: 'show' },
    { key: 'subnet', header: 'Subnet', phone: 'show', render: (r) => <span style={mono}>{r.subnet}</span> },
    { key: 'gateway', header: 'Gateway', render: (r) => <span style={mono}>{r.gateway}</span> },
    { key: 'dhcp_range', header: 'DHCP range', render: (r) => <span style={mono}>{r.dhcp_range}</span> },
    { key: 'reserved', header: 'Reserved' },
  ];

  const cableStats: StatItem[] = result?.cable_estimate ? [
    { label: 'Cat6 runs', value: String(result.cable_estimate.cat6_runs), icon: <Path size={15} /> },
    { label: 'Cat6a runs', value: String(result.cable_estimate.cat6a_runs), icon: <Path size={15} /> },
    { label: 'Fiber runs', value: String(result.cable_estimate.fiber_runs), icon: <Path size={15} /> },
    { label: 'Total length', value: `${result.cable_estimate.total_length_ft?.toLocaleString()} ft`, icon: <Ruler size={15} /> },
    { label: 'Est. cost', value: fmt$(result.cable_estimate.estimated_cost || 0), icon: <CurrencyDollar size={15} /> },
  ] : [];

  const applyButton = (
    <Button
      variant={applied ? 'secondary' : 'primary'}
      icon={applied ? <CheckCircle size={15} weight="fill" /> : <CheckCircle size={15} />}
      onClick={applyAll}
      disabled={applying || applied || !networkProjectId}
    >
      {applied ? 'Applied to project' : applying ? 'Applying…' : 'Apply all to project'}
    </Button>
  );

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'AI Wizard')}
      title="AI network wizard"
      subtitle={ctx?.project?.name || undefined}
    >
      <style>{CSS}</style>
      <NetworkTabs projectId={projectId} value="wizard" />

      <Card title="Site information" icon={<SlidersHorizontal size={16} />}>
        <FormGrid cols={4}>
          <Field label="Site type">
            <Select value={form.site_type} onChange={e => setForm({ ...form, site_type: e.target.value })} options={SITE_TYPES} />
          </Field>
          <Field label="Square footage">
            <Input type="number" value={form.square_footage} onChange={e => setForm({ ...form, square_footage: +e.target.value })} />
          </Field>
          <Field label="Floors">
            <Input type="number" value={form.floor_count} onChange={e => setForm({ ...form, floor_count: +e.target.value })} />
          </Field>
          <Field label="Manufacturer">
            <Select value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} options={MANUFACTURERS.map(m => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))} />
          </Field>

          <FormSection>Device counts</FormSection>
          {COUNT_FIELDS.map(item => (
            <Field key={item.key} label={item.label}>
              <Input type="number" value={num(item.key)} onChange={e => setForm({ ...form, [item.key]: +e.target.value })} />
            </Field>
          ))}

          <FormSection>Features</FormSection>
          <div className="netWizChecks">
            <label><input type="checkbox" checked={form.guest_wifi} onChange={e => setForm({ ...form, guest_wifi: e.target.checked })} /> Guest WiFi</label>
            <label><input type="checkbox" checked={form.voip} onChange={e => setForm({ ...form, voip: e.target.checked })} /> VoIP system</label>
          </div>

          <FormSection>Budget range (optional)</FormSection>
          <Field label="Min ($)">
            <Input type="number" value={form.budget_min} onChange={e => setForm({ ...form, budget_min: +e.target.value })} placeholder="0" />
          </Field>
          <Field label="Max ($)">
            <Input type="number" value={form.budget_max} onChange={e => setForm({ ...form, budget_max: +e.target.value })} placeholder="0" />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Button
            variant={result ? 'secondary' : 'primary'}
            icon={generating ? <span className="netWizSpin"><Gear size={15} /></span> : <Robot size={15} />}
            onClick={generateDesign}
            disabled={generating}
          >
            {generating ? 'Generating network design…' : result ? 'Regenerate design' : 'Generate network design'}
          </Button>
        </div>
      </Card>

      {streamText && !result && (
        <Card title={generating ? 'AI is designing your network…' : 'Design output'} icon={<Robot size={16} />}>
          <div ref={streamRef} className="netWizStream"><pre>{streamText}</pre></div>
        </Card>
      )}

      {result && (
        <>
          {result.summary && (
            <Card title="Design summary" icon={<Sparkle size={16} />}>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>{result.summary}</div>
            </Card>
          )}

          {result.vlans && result.vlans.length > 0 && (
            <Card title="VLAN plan" icon={<TreeStructure size={16} />} flush>
              <DataTable tableId="project-network-wizard-vlans" exportName="wizard-vlan-plan" columns={vlanCols} rows={indexed(result.vlans)} rowKey={(r) => r._i} defaultSort={{ key: 'vlan_id', dir: 'asc' }} />
            </Card>
          )}

          {result.equipment && result.equipment.length > 0 && (
            <Card title="Equipment list" subtitle={`Total: ${fmt$(result.total_equipment_cost || 0)}`} icon={<Package size={16} />} flush>
              <DataTable tableId="project-network-wizard-equipment" exportName="wizard-equipment" columns={equipCols} rows={indexed(result.equipment)} rowKey={(r) => r._i} />
            </Card>
          )}

          {result.ip_scheme && result.ip_scheme.length > 0 && (
            <Card title="IP addressing scheme" icon={<Globe size={16} />} flush>
              <DataTable tableId="project-network-wizard-ip" exportName="wizard-ip-scheme" columns={ipCols} rows={indexed(result.ip_scheme)} rowKey={(r) => r._i} />
            </Card>
          )}

          {result.firewall_rules && result.firewall_rules.length > 0 && (
            <Card title="Firewall rules" icon={<ShieldCheck size={16} />} flush>
              <ItemList>
                {result.firewall_rules.map((rule, i) => (
                  <ItemRow
                    key={i}
                    icon={<ShieldCheck size={16} />}
                    tone={rule.action === 'allow' ? 'success' : 'danger'}
                    title={rule.name}
                    desc={`${rule.source} → ${rule.destination} (${rule.protocol}/${rule.port})`}
                    value={<Badge tone={rule.action === 'allow' ? 'ongoing' : 'overdue'}>{cap(rule.action)}</Badge>}
                  />
                ))}
              </ItemList>
            </Card>
          )}

          {result.wifi_ssids && result.wifi_ssids.length > 0 && (
            <Card title="WiFi SSID recommendations" icon={<WifiHigh size={16} />} flush>
              <ItemList>
                {result.wifi_ssids.map((ssid, i) => (
                  <ItemRow
                    key={i}
                    icon={<WifiHigh size={16} />}
                    title={ssid.ssid}
                    desc={`${ssid.security} · VLAN ${ssid.vlan} · ${ssid.band}`}
                    value={ssid.purpose}
                  />
                ))}
              </ItemList>
            </Card>
          )}

          {result.cable_estimate && (
            <Card title="Cable estimate" icon={<Path size={16} />}>
              <StatRow items={cableStats} />
            </Card>
          )}

          {!networkProjectId && (
            <Callout tone="warning" icon={<WarningCircle size={16} />} title="Set up the network module first" text="Apply needs this job's network module. Set it up from the Network overview." />
          )}
          <div>{applyButton}</div>
        </>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
