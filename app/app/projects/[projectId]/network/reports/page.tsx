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

interface ReportHistory {
  id: string;
  report_type: string;
  name: string;
  format: string;
  download_url: string;
  created_at: string;
  file_size: number;
}

const REPORT_TYPES = [
  {
    type: 'ip_schedule',
    label: 'IP Schedule',
    icon: '📋',
    description: 'Complete IP address assignment schedule for all devices, VLANs, and reserved addresses.',
    color: BLUE,
  },
  {
    type: 'cable_schedule',
    label: 'Cable Schedule',
    icon: '🔌',
    description: 'Full cable run schedule with labels, types, from/to locations, test results, and lengths.',
    color: GREEN,
  },
  {
    type: 'port_map',
    label: 'Port Map',
    icon: '🔀',
    description: 'Switch port assignments showing device connections, VLANs, and PoE status per port.',
    color: '#8B5CF6',
  },
  {
    type: 'wifi_survey',
    label: 'WiFi Survey',
    icon: '📡',
    description: 'WiFi coverage survey with AP locations, channels, power levels, and signal coverage estimates.',
    color: '#14B8A6',
  },
  {
    type: 'as_built',
    label: 'As-Built Documentation',
    icon: '📐',
    description: 'Complete as-built network documentation including topology, device configs, and cable routes.',
    color: GOLD,
  },
  {
    type: 'executive_summary',
    label: 'Executive Summary',
    icon: '📊',
    description: 'High-level project summary with equipment counts, costs, timeline, and key metrics.',
    color: '#F97316',
  },
];

const FORMAT_OPTIONS = ['pdf', 'excel', 'csv'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: BASE, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
};

export default function ReportsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [generating, setGenerating] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [showBranding, setShowBranding] = useState(false);
  const [branding, setBranding] = useState({
    company_name: '', logo_url: '', primary_color: GOLD, secondary_color: BLUE,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);

      const histRes = await fetch(`/api/network/reports?networkProjectId=${npData.networkProject.id}`);
      const histData = await histRes.json();
      setHistory(histData.reports || []);
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generateReport = async (reportType: string) => {
    if (!networkProjectId) return;
    setGenerating(reportType);
    try {
      const res = await fetch('/api/network/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network_project_id: networkProjectId,
          report_type: reportType,
          format: selectedFormat,
          branding,
        }),
      });
      const data = await res.json();
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      }
      fetchData();
    } catch { /* */ }
    setGenerating('');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBranding({ ...branding, logo_url: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const cardStyle: React.CSSProperties = {
    background: `${CARD}cc`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20,
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ color: DIM }}>Loading reports...</div></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: TEXT, fontSize: 12, marginLeft: 4 }}>Reports</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0 }}>Network Reports</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} style={{ ...inputStyle, width: 100 }}>
            {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
          <button onClick={() => setShowBranding(!showBranding)} style={{
            padding: '10px 14px', background: '#E2E5EA', color: TEXT,
            border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {showBranding ? 'Hide' : 'Branding'}
          </button>
        </div>
      </div>

      {/* Branding Section */}
      {showBranding && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>Custom Branding</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input value={branding.company_name} onChange={e => setBranding({ ...branding, company_name: e.target.value })} placeholder="Your Company" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Logo</label>
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ ...inputStyle, padding: '8px 12px' }} />
            </div>
            <div>
              <label style={labelStyle}>Primary Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={branding.primary_color} onChange={e => setBranding({ ...branding, primary_color: e.target.value })} style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                <input value={branding.primary_color} onChange={e => setBranding({ ...branding, primary_color: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Secondary Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={branding.secondary_color} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })} style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                <input value={branding.secondary_color} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
          </div>
          {branding.logo_url && (
            <div style={{ marginTop: 12 }}>
              <img src={branding.logo_url} alt="Logo preview" style={{ height: 40, borderRadius: 4 }} />
            </div>
          )}
        </div>
      )}

      {/* Report Type Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
        {REPORT_TYPES.map(report => (
          <div key={report.type} style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>{report.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>{report.label}</div>
                <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{report.description}</div>
              </div>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              {FORMAT_OPTIONS.map(fmt => (
                <button
                  key={fmt}
                  onClick={() => { setSelectedFormat(fmt); generateReport(report.type); }}
                  disabled={generating === report.type}
                  style={{
                    flex: 1, padding: '8px 12px',
                    background: generating === report.type ? `${report.color}10` : '#E2E5EA',
                    color: report.color, border: `1px solid ${report.color}30`,
                    borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    opacity: generating === report.type ? 0.6 : 1, textTransform: 'uppercase',
                  }}
                >
                  {generating === report.type ? '...' : fmt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Report History */}
      <div style={cardStyle}>
        <h3 style={{ color: TEXT, fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>Report History</h3>
        {history.length === 0 ? (
          <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 24 }}>
            No reports generated yet. Select a report type above to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(report => (
              <div key={report.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: '#F8F9FB', borderRadius: 8, border: `1px solid ${BORDER}`,
              }}>
                <span style={{ fontSize: 18 }}>
                  {REPORT_TYPES.find(r => r.type === report.report_type)?.icon || '📄'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{report.name}</div>
                  <div style={{ color: DIM, fontSize: 11 }}>
                    {new Date(report.created_at).toLocaleString()} &middot; {report.format.toUpperCase()} &middot; {formatFileSize(report.file_size || 0)}
                  </div>
                </div>
                <a
                  href={report.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 14px', background: `${BLUE}15`, color: BLUE, border: `1px solid ${BLUE}30`,
                    borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
                  }}
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}