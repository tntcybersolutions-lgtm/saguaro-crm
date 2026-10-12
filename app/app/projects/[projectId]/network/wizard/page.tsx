'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Robot, Laptop, Phone, Printer, VideoCamera, WifiHigh, Plug, Gear, CheckCircle, SlidersHorizontal, Sparkle, TreeStructure, Package, Globe, ShieldCheck, Path, Ruler, CurrencyDollar } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, goldButtonStyle } from '@/components/ui/premium';

const BASE = 'var(--bg-surface-2)';
const GOLD = 'var(--brand-primary)';
const GREEN = '#4ADE80';
const BLUE = 'var(--brand-primary)';
const RED = '#F87171';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';

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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function NetworkWizardPage() {
  const { projectId } = useParams() as { projectId: string };
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
      .catch(() => {});
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
    } catch (err) {
      setStreamText('Error generating design. Please try again.');
    }
    setGenerating(false);
  };

  const applyAll = async () => {
    if (!result || !networkProjectId) return;
    setApplying(true);
    try {
      await fetch('/api/network/wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network_project_id: networkProjectId, result }),
      });
      setApplied(true);
    } catch { /* */ }
    setApplying(false);
  };

  const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network →</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>AI Wizard</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="AI Wizard"
        eyebrowIcon={<Robot size={13} weight="fill" color="var(--text-secondary)" />}
        title="AI Network"
        accent="Wizard"
        subtitle="Describe your site and let AI design your complete network infrastructure."
      />

      {/* Input Form */}
      <SectionCard title="Site Information" icon={<SlidersHorizontal size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Site Type</label>
            <select value={form.site_type} onChange={e => setForm({ ...form, site_type: e.target.value })} style={inputStyle}>
              {SITE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Square Footage</label>
            <input type="number" value={form.square_footage} onChange={e => setForm({ ...form, square_footage: +e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Floors</label>
            <input type="number" value={form.floor_count} onChange={e => setForm({ ...form, floor_count: +e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Manufacturer</label>
            <select value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} style={inputStyle}>
              {MANUFACTURERS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <h4 style={{ color: DIM, fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>Device Counts</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { key: 'workstations', label: 'Workstations', icon: <Laptop size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
            { key: 'phones', label: 'VoIP Phones', icon: <Phone size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
            { key: 'printers', label: 'Printers', icon: <Printer size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
            { key: 'cameras', label: 'Cameras', icon: <VideoCamera size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
            { key: 'access_points', label: 'Access Points', icon: <WifiHigh size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
            { key: 'iot_devices', label: 'IoT Devices', icon: <Plug size={14} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> },
          ].map(item => (
            <div key={item.key}>
              <label style={labelStyle}>{item.icon} {item.label}</label>
              <input
                type="number"
                value={(form as Record<string, unknown>)[item.key] as number}
                onChange={e => setForm({ ...form, [item.key]: +e.target.value })}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <h4 style={{ color: DIM, fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>Features</h4>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.guest_wifi} onChange={e => setForm({ ...form, guest_wifi: e.target.checked })} />
            Guest WiFi
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.voip} onChange={e => setForm({ ...form, voip: e.target.checked })} />
            VoIP System
          </label>
        </div>

        <h4 style={{ color: DIM, fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>Budget Range (Optional)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 400 }}>
          <div>
            <label style={labelStyle}>Min ($)</label>
            <input type="number" value={form.budget_min} onChange={e => setForm({ ...form, budget_min: +e.target.value })} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Max ($)</label>
            <input type="number" value={form.budget_max} onChange={e => setForm({ ...form, budget_max: +e.target.value })} placeholder="0" style={inputStyle} />
          </div>
        </div>

        <button onClick={generateDesign} disabled={generating} className="pmBtn" style={{
          ...goldButtonStyle,
          marginTop: 20, padding: '12px 28px', fontSize: 14,
          opacity: generating ? 0.6 : 1, cursor: generating ? 'default' : 'pointer',
        }}>
          {generating ? (
            <>
              <span style={{ display: 'inline-flex', animation: 'spin 1s linear infinite' }}><Gear size={16} weight="regular" color="var(--on-brand)" /></span>
              Generating Network Design…
            </>
          ) : (
            <>
              <Robot size={16} weight="regular" color="var(--on-brand)" />
              Generate Network Design
            </>
          )}
        </button>
      </SectionCard>

      {/* Streaming Output */}
      {streamText && !result && (
        <SectionCard flat
          title="AI is designing your network…"
          icon={<Robot size={17} weight="duotone" color="var(--text-secondary)" />}
          flush
          style={{ marginBottom: 24 }}
        >
          <div ref={streamRef} style={{ maxHeight: 400, overflow: 'auto', padding: 20 }}>
            <pre style={{ color: TEXT, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'system-ui', lineHeight: 1.6, margin: 0 }}>{streamText}</pre>
          </div>
        </SectionCard>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          {result.summary && (
            <SectionCard flat title="Design Summary" icon={<Sparkle size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 16 }}>
              <div style={{ color: TEXT, fontSize: 14, lineHeight: 1.6 }}>{result.summary}</div>
            </SectionCard>
          )}

          {/* VLAN Plan */}
          {result.vlans && result.vlans.length > 0 && (
            <SectionCard title="VLAN Plan" icon={<TreeStructure size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 16 }}>
              <div style={{ overflow: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['VLAN', 'Name', 'Subnet', 'Gateway', 'Purpose'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.vlans.map((v, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'monospace', fontWeight: 700 }}>{v.vlan_id}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT }}>{v.name}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontFamily: 'monospace' }}>{v.subnet}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontFamily: 'monospace' }}>{v.gateway}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{v.purpose}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Equipment List */}
          {result.equipment && result.equipment.length > 0 && (
            <SectionCard
              title="Equipment List"
              icon={<Package size={17} weight="duotone" color="var(--text-secondary)" />}
              action={<span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 800 }}>Total: {fmt$(result.total_equipment_cost || 0)}</span>}
              style={{ marginBottom: 16 }}
            >
              <div style={{ overflow: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Type', 'Manufacturer', 'Model', 'Qty', 'Unit Cost', 'Total'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.equipment.map((eq, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, textTransform: 'capitalize' }}>{eq.type?.replace(/_/g, ' ')}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, textTransform: 'capitalize' }}>{eq.manufacturer}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM }}>{eq.model}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontWeight: 700 }}>{eq.quantity}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM }}>{fmt$(eq.unit_cost)}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: GREEN, fontWeight: 700 }}>{fmt$(eq.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* IP Addressing */}
          {result.ip_scheme && result.ip_scheme.length > 0 && (
            <SectionCard title="IP Addressing Scheme" icon={<Globe size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 16 }}>
              <div style={{ overflow: 'auto' }}>
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['VLAN', 'Subnet', 'Gateway', 'DHCP Range', 'Reserved'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.ip_scheme.map((ip, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT }}>{ip.vlan}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'monospace' }}>{ip.subnet}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontFamily: 'monospace' }}>{ip.gateway}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontFamily: 'monospace' }}>{ip.dhcp_range}</td>
                        <td style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM }}>{ip.reserved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Firewall Summary */}
          {result.firewall_rules && result.firewall_rules.length > 0 && (
            <SectionCard flat title="Firewall Rules" icon={<ShieldCheck size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 16 }}>
              {result.firewall_rules.map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: i < result.firewall_rules.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <span style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 8, fontWeight: 700,
                    background: rule.action === 'allow' ? `${GREEN}15` : `${RED}15`,
                    color: rule.action === 'allow' ? GREEN : RED, textTransform: 'capitalize',
                  }}>{rule.action}</span>
                  <span style={{ color: TEXT, fontSize: 12 }}>{rule.name}</span>
                  <span style={{ color: DIM, fontSize: 12 }}>{rule.source} → {rule.destination} ({rule.protocol}/{rule.port})</span>
                </div>
              ))}
            </SectionCard>
          )}

          {/* WiFi SSIDs */}
          {result.wifi_ssids && result.wifi_ssids.length > 0 && (
            <SectionCard flat title="WiFi SSID Recommendations" icon={<WifiHigh size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 16 }}>
              {result.wifi_ssids.map((ssid, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: i < result.wifi_ssids.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <span style={{ display: 'inline-flex' }}><WifiHigh size={18} weight="regular" color={TEXT} /></span>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{ssid.ssid}</span>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: `${GREEN}15`, color: GREEN }}>{ssid.security}</span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: DIM }}>VLAN {ssid.vlan}</span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: DIM }}>{ssid.band}</span>
                    </div>
                  </div>
                  <span style={{ color: DIM, fontSize: 12 }}>{ssid.purpose}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {/* Cable Estimate */}
          {result.cable_estimate && (
            <SectionCard flat title="Cable Estimate" icon={<Path size={17} weight="duotone" color="var(--text-secondary)" />} style={{ marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <StatCard icon={<Path size={19} weight="duotone" color="var(--text-secondary)" />} label="Cat6 Runs" value={String(result.cable_estimate.cat6_runs)}  href={`/app/projects/${projectId}/network/cables`}/>
                <StatCard icon={<Path size={19} weight="duotone" color="var(--text-secondary)" />} label="Cat6a Runs" value={String(result.cable_estimate.cat6a_runs)}  href={`/app/projects/${projectId}/network/cables`}/>
                <StatCard icon={<Path size={19} weight="duotone" color="var(--text-secondary)" />} label="Fiber Runs" value={String(result.cable_estimate.fiber_runs)} accent={BLUE}  href={`/app/projects/${projectId}/network/cables`}/>
                <StatCard icon={<Ruler size={19} weight="duotone" color="var(--text-secondary)" />} label="Total Length" value={`${result.cable_estimate.total_length_ft?.toLocaleString()} ft`}  href={`/app/projects/${projectId}/network/wizard`}/>
                <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GREEN} />} label="Est. Cost" value={fmt$(result.cable_estimate.estimated_cost || 0)} accent={GREEN}  href={`/app/projects/${projectId}/network/wizard`}/>
              </div>
            </SectionCard>
          )}

          {/* Apply All Button */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <button onClick={applyAll} disabled={applying || applied} className="pmBtn" style={{
              ...goldButtonStyle,
              padding: '14px 40px', fontSize: 15,
              ...(applied ? { background: `${GREEN}20`, color: GREEN, border: `1px solid ${GREEN}`, boxShadow: 'none' } : {}),
              opacity: applying ? 0.6 : 1,
              cursor: applying || applied ? 'default' : 'pointer',
            }}>
              {applied ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle' }}>
                  <CheckCircle size={16} weight="fill" color={GREEN} /> Applied to Project
                </span>
              ) : applying ? 'Applying…' : 'Apply All to Project'}
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </PremiumSurface>
  );
}
