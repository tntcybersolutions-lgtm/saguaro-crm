'use client';
/**
 * Network › Config — device-ready configuration from manufacturer templates:
 * pick a template, fill its variables, generate, then copy, download or apply
 * the result to a device on the job.
 *
 * Reads  GET   /api/network/projects?projectId=
 *        GET   /api/network/config-templates?manufacturer=
 *        GET   /api/network/devices?networkProjectId=
 * Writes POST  /api/network/generate-config   { template_id, variables }
 *        PATCH /api/network/devices/:id        { config_id, config_content }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Badge, Button, Card, Tabs, EmptyState, Select, Field, Input, FormGrid,
  ItemList, ItemRow, Toast, useToast,
  type StatItem,
} from '@/components/ui/kit';
import { Gear, Stack, Terminal, Copy, DownloadSimple, Devices, Factory, WarningCircle, Lightning } from '@phosphor-icons/react';
import NetworkTabs, { networkCrumbs, networkHref, NetworkNotSetUp } from '../_components/NetworkTabs';

interface ConfigTemplate {
  id: string;
  name: string;
  manufacturer: string;
  device_type: string;
  description: string;
  template_content: string;
  variables: Record<string, { type: string; label: string; default?: string; options?: string[]; required?: boolean }>;
  created_at: string;
}

interface Device {
  id: string;
  hostname: string;
  device_type: string;
  manufacturer: string;
}

const MANUFACTURER_TABS = ['All', 'Cisco', 'Ubiquiti', 'Meraki', 'Aruba', 'Fortinet'];

const CSS = `
.netCfg { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--section-gap); align-items: start; }
@media (min-width: 900px) { .netCfg { grid-template-columns: 320px minmax(0, 1fr); } }
.netCfgOut { background: var(--bg-surface-2); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 16px; color: var(--success); font-size: 12px; font-family: var(--font-mono, monospace); line-height: 1.6; overflow: auto; max-height: 400px; white-space: pre-wrap; word-break: break-all; margin: 0; }
`;

export default function ConfigGeneratorPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState<ConfigTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [applyDevice, setApplyDevice] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);

      const [tmplRes, devRes] = await Promise.all([
        fetch(`/api/network/config-templates?manufacturer=${activeTab === 'All' ? '' : activeTab.toLowerCase()}`),
        fetch(`/api/network/devices?networkProjectId=${npData.networkProject.id}`),
      ]);
      const [tmplData, devData] = await Promise.all([tmplRes.json(), devRes.json()]);
      setTemplates(tmplData.templates || []);
      setDevices(devData.devices || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load templates");
    }
    setLoading(false);
  }, [projectId, activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectTemplate = (template: ConfigTemplate) => {
    setSelectedTemplate(template);
    setGeneratedConfig('');
    const defaults: Record<string, string> = {};
    if (template.variables) {
      Object.entries(template.variables).forEach(([key, v]) => {
        defaults[key] = v.default || '';
      });
    }
    setVariableValues(defaults);
  };

  const generateConfig = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/network/generate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedTemplate.id, variables: variableValues }),
      });
      const data = await res.json();
      setGeneratedConfig(data.config || 'Error generating config.');
    } catch {
      setGeneratedConfig('Error generating configuration.');
    }
    setGenerating(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedConfig).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => show("Couldn't copy to the clipboard", 'bad'),
    );
  };

  const downloadConfig = () => {
    const blob = new Blob([generatedConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate?.name || 'config'}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyToDevice = async () => {
    if (!applyDevice || !selectedTemplate) return;
    try {
      const res = await fetch(`/api/network/devices/${applyDevice}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: selectedTemplate.id, config_content: generatedConfig }),
      });
      if (res.ok) { setApplyDevice(''); show('Config applied to device'); }
      else show("Couldn't apply the config", 'bad');
    } catch {
      show("Couldn't apply the config", 'bad');
    }
  };

  const filteredTemplates = activeTab === 'All' ? templates : templates.filter(t => (t.manufacturer || '').toLowerCase() === activeTab.toLowerCase());
  const matchingDevices = selectedTemplate ? devices.filter(d =>
    (d.manufacturer || '').toLowerCase() === (selectedTemplate.manufacturer || '').toLowerCase() ||
    d.device_type === selectedTemplate.device_type,
  ) : [];

  const stats: StatItem[] = [
    { label: 'Templates', value: loading ? '—' : String(filteredTemplates.length), sub: activeTab === 'All' ? 'All manufacturers' : `${activeTab} library`, icon: <Stack size={15} /> },
    { label: 'Manufacturers', value: String(MANUFACTURER_TABS.length - 1), sub: 'Template libraries', icon: <Factory size={15} /> },
    { label: 'Job devices', value: loading ? '—' : String(devices.length), sub: 'Ready to receive config', icon: <Devices size={15} />, href: networkHref(projectId, 'devices') },
    { label: 'Selected', value: selectedTemplate ? selectedTemplate.name : '—', sub: selectedTemplate ? selectedTemplate.manufacturer : 'Pick a template', icon: <Gear size={15} /> },
  ];

  if (!loading && !loadError && !networkProjectId) {
    return (
      <PageShell crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Config')} title="Config generator" subtitle={ctx?.project?.name || undefined}>
        <NetworkTabs projectId={projectId} value="config" />
        <NetworkNotSetUp projectId={projectId} />
      </PageShell>
    );
  }

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Config')}
      title="Config generator"
      subtitle={ctx?.project?.name || undefined}
    >
      <style>{CSS}</style>
      <NetworkTabs projectId={projectId} value="config" />

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load templates" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <>
          <StatRow items={stats} />
          <div className="netCfg">
            <Card title="Template library" icon={<Stack size={16} />} flush>
              <div style={{ padding: '0 12px' }}>
                <Tabs tabs={MANUFACTURER_TABS.map(t => ({ key: t, label: t }))} value={activeTab} onChange={setActiveTab} />
              </div>
              {loading ? (
                <EmptyState title="Loading templates…" />
              ) : filteredTemplates.length === 0 ? (
                <EmptyState icon={<Stack size={22} />} title="No templates found" onClearFilters={activeTab !== 'All' ? () => setActiveTab('All') : undefined} />
              ) : (
                <ItemList>
                  {filteredTemplates.map(tmpl => (
                    <ItemRow
                      key={tmpl.id}
                      icon={<Terminal size={16} />}
                      title={tmpl.name}
                      desc={`${tmpl.manufacturer} · ${(tmpl.device_type || '').replace(/_/g, ' ')}${tmpl.description ? ` · ${tmpl.description}` : ''}`}
                      value={selectedTemplate?.id === tmpl.id ? <Badge tone="gold">Selected</Badge> : undefined}
                      onClick={() => selectTemplate(tmpl)}
                    />
                  ))}
                </ItemList>
              )}
            </Card>

            <Card
              title={selectedTemplate ? selectedTemplate.name : 'Configuration'}
              subtitle={selectedTemplate ? selectedTemplate.description : undefined}
              icon={<Terminal size={16} />}
            >
              {!selectedTemplate ? (
                <EmptyState icon={<Gear size={22} />} title="Select a template to begin" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {selectedTemplate.variables && Object.keys(selectedTemplate.variables).length > 0 && (
                    <FormGrid cols={2}>
                      {Object.entries(selectedTemplate.variables).map(([key, variable]) => (
                        <Field key={key} label={variable.label || key} required={variable.required}>
                          {variable.options ? (
                            <Select value={variableValues[key] || ''} onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                              placeholder="Select…" options={variable.options} />
                          ) : variable.type === 'boolean' ? (
                            <Select value={variableValues[key] || 'false'} onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                              options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
                          ) : (
                            <Input
                              type={variable.type === 'number' ? 'number' : 'text'}
                              value={variableValues[key] || ''}
                              onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                              placeholder={variable.default || ''}
                            />
                          )}
                        </Field>
                      ))}
                    </FormGrid>
                  )}

                  <div>
                    <Button variant="primary" icon={<Lightning size={15} weight="fill" />} onClick={generateConfig} disabled={generating}>
                      {generating ? 'Generating…' : 'Generate config'}
                    </Button>
                  </div>

                  {generatedConfig && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginRight: 'auto' }}>Generated configuration</span>
                        <Button size="sm" icon={<Copy size={14} />} onClick={copyToClipboard}>{copied ? 'Copied!' : 'Copy'}</Button>
                        <Button size="sm" icon={<DownloadSimple size={14} />} onClick={downloadConfig}>Download .conf</Button>
                      </div>
                      <pre className="netCfgOut">{generatedConfig}</pre>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <Field label="Apply to device">
                            <Select value={applyDevice} onChange={e => setApplyDevice(e.target.value)} placeholder="Select device…"
                              options={matchingDevices.map(d => ({ value: d.id, label: `${d.hostname} (${d.manufacturer} ${d.device_type})` }))} />
                          </Field>
                        </div>
                        <Button onClick={applyToDevice} disabled={!applyDevice}>Apply</Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
