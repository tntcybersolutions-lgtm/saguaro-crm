'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BASE = '#F8F9FB';
const CARD = '#F8F9FB';
const GOLD = '#C8960F';
const GREEN = '#22C55E';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const BORDER = '#E5E7EB';
const DIM = '#6B7280';
const TEXT = '#111827';

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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function ConfigGeneratorPage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState<ConfigTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [applyDevice, setApplyDevice] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
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
    } catch { /* */ }
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
    navigator.clipboard.writeText(generatedConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      await fetch(`/api/network/devices/${applyDevice}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: selectedTemplate.id, config_content: generatedConfig }),
      });
      setApplyDevice('');
    } catch { /* */ }
  };

  const filteredTemplates = activeTab === 'All' ? templates : templates.filter(t => t.manufacturer.toLowerCase() === activeTab.toLowerCase());

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading configs...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Config Generator</span>
      </div>
      <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Config Generator</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, minHeight: '60vh' }}>
        {/* Left Panel - Template Library */}
        <div style={cardStyle}>
          <h3 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Template Library</h3>

          {/* Manufacturer Tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {MANUFACTURER_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '4px 10px', border: `1px solid ${activeTab === tab ? GOLD : BORDER}`,
                  borderRadius: 6, background: activeTab === tab ? `${GOLD}15` : 'transparent',
                  color: activeTab === tab ? GOLD : DIM, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >{tab}</button>
            ))}
          </div>

          {/* Template List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredTemplates.length === 0 ? (
              <div style={{ color: DIM, fontSize: 12, textAlign: 'center', padding: 24 }}>No templates found.</div>
            ) : (
              filteredTemplates.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => selectTemplate(tmpl)}
                  style={{
                    padding: '10px 12px', background: selectedTemplate?.id === tmpl.id ? `${GOLD}10` : '#F8F9FB',
                    border: `1px solid ${selectedTemplate?.id === tmpl.id ? `${GOLD}40` : BORDER}`,
                    borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{tmpl.name}</div>
                  <div style={{ color: DIM, fontSize: 11, marginTop: 2 }}>
                    {tmpl.manufacturer} &middot; {tmpl.device_type?.replace(/_/g, ' ')}
                  </div>
                  {tmpl.description && <div style={{ color: DIM, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{tmpl.description}</div>}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Generator */}
        <div style={cardStyle}>
          {!selectedTemplate ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
                <div style={{ color: DIM, fontSize: 14 }}>Select a template from the library to begin</div>
              </div>
            </div>
          ) : (
            <>
              <h3 style={{ color: TEXT, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{selectedTemplate.name}</h3>
              <div style={{ color: DIM, fontSize: 12, marginBottom: 16 }}>{selectedTemplate.description}</div>

              {/* Variable Inputs */}
              {selectedTemplate.variables && Object.keys(selectedTemplate.variables).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: DIM, fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Configuration Variables</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    {Object.entries(selectedTemplate.variables).map(([key, variable]) => (
                      <div key={key}>
                        <label style={labelStyle}>
                          {variable.label || key}
                          {variable.required && <span style={{ color: RED }}> *</span>}
                        </label>
                        {variable.options ? (
                          <select
                            value={variableValues[key] || ''}
                            onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                            style={inputStyle}
                          >
                            <option value="">Select...</option>
                            {variable.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : variable.type === 'boolean' ? (
                          <select
                            value={variableValues[key] || 'false'}
                            onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                            style={inputStyle}
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            type={variable.type === 'number' ? 'number' : 'text'}
                            value={variableValues[key] || ''}
                            onChange={e => setVariableValues({ ...variableValues, [key]: e.target.value })}
                            placeholder={variable.default || ''}
                            style={inputStyle}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={generateConfig} disabled={generating} style={{
                padding: '10px 24px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
                color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: generating ? 0.5 : 1, marginBottom: 16,
              }}>
                {generating ? 'Generating...' : 'Generate Config'}
              </button>

              {/* Generated Config Output */}
              {generatedConfig && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ color: DIM, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Generated Configuration</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={copyToClipboard} style={{
                        padding: '6px 12px', background: copied ? `${GREEN}15` : '#E2E5EA',
                        color: copied ? GREEN : TEXT, border: `1px solid ${copied ? GREEN : BORDER}`,
                        borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                      <button onClick={downloadConfig} style={{
                        padding: '6px 12px', background: '#E2E5EA',
                        color: TEXT, border: `1px solid ${BORDER}`,
                        borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>
                        Download .conf
                      </button>
                    </div>
                  </div>
                  <pre style={{
                    background: '#F8F9FB', border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: 16, color: GREEN, fontSize: 12, fontFamily: 'monospace',
                    lineHeight: 1.6, overflow: 'auto', maxHeight: 400,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {generatedConfig}
                  </pre>

                  {/* Apply to Device */}
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Apply to Device</label>
                      <select value={applyDevice} onChange={e => setApplyDevice(e.target.value)} style={inputStyle}>
                        <option value="">Select device...</option>
                        {devices.filter(d =>
                          d.manufacturer.toLowerCase() === selectedTemplate.manufacturer.toLowerCase() ||
                          d.device_type === selectedTemplate.device_type
                        ).map(d => (
                          <option key={d.id} value={d.id}>{d.hostname} ({d.manufacturer} {d.device_type})</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={applyToDevice} disabled={!applyDevice} style={{
                      padding: '10px 16px', background: applyDevice ? `${BLUE}20` : 'transparent',
                      color: applyDevice ? BLUE : DIM, border: `1px solid ${applyDevice ? BLUE : BORDER}`,
                      borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: applyDevice ? 'pointer' : 'default',
                    }}>
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}