'use client';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import { openPdf } from '@/components/PdfViewer';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Clipboard, Plug, Shuffle, WifiHigh, Ruler, ChartBar, FileText, Archive } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, FlowStrip, ghostButtonStyle } from '@/components/ui/premium';

const BASE = '#1c1c1e';
const GOLD = '#F59E0B';
const GREEN = '#34C759';
const BLUE = '#F59E0B';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';

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
    icon: Clipboard,
    description: 'Complete IP address assignment schedule for all devices, VLANs, and reserved addresses.',
    color: BLUE,
  },
  {
    type: 'cable_schedule',
    label: 'Cable Schedule',
    icon: Plug,
    description: 'Full cable run schedule with labels, types, from/to locations, test results, and lengths.',
    color: GREEN,
  },
  {
    type: 'port_map',
    label: 'Port Map',
    icon: Shuffle,
    description: 'Switch port assignments showing device connections, VLANs, and PoE status per port.',
    color: '#8B5CF6',
  },
  {
    type: 'wifi_survey',
    label: 'WiFi Survey',
    icon: WifiHigh,
    description: 'WiFi coverage survey with AP locations, channels, power levels, and signal coverage estimates.',
    color: '#14B8A6',
  },
  {
    type: 'as_built',
    label: 'As-Built Documentation',
    icon: Ruler,
    description: 'Complete as-built network documentation including topology, device configs, and cable routes.',
    color: GOLD,
  },
  {
    type: 'executive_summary',
    label: 'Executive Summary',
    icon: ChartBar,
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

// Premium surface card (matches the kit's StatCard/SectionCard depth) used for
// each report-type tile inside the "Generate a Report" section.
const reportCardStyle: React.CSSProperties = {
  position: 'relative', overflow: 'hidden',
  background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20,
  boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
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
        openPdf({ url: data.download_url, title: 'Network Report' });
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

  if (loading) {
    return (
      <PremiumSurface maxWidth={1600}>
        <ModuleSkeleton kpis={4} rows={5} />
      </PremiumSurface>
    );
  }

  return (
    <PremiumSurface maxWidth={1600}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <Link href={`/app/projects/${projectId}/network`} style={{ color: DIM, fontSize: 12, textDecoration: 'none' }}>Network &gt;</Link>
        <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, marginLeft: 4 }}>Reports</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="NETWORK"
        eyebrowIcon={<FileText size={13} weight="fill" color={GOLD} />}
        title="Network"
        accent="Reports"
        subtitle="IP schedules, cable schedules, port maps, and as-builts."
        actions={<>
          <select
            value={selectedFormat}
            onChange={e => setSelectedFormat(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
          >
            {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
          <button onClick={() => setShowBranding(!showBranding)} style={ghostButtonStyle} className="pmBtn">
            {showBranding ? 'Hide Branding' : 'Branding'}
          </button>
        </>}
      />

      {/* Document intelligence — live counts from this network project */}
      {(() => {
        const latest = history.reduce<ReportHistory | null>((best, r) => (!best || new Date(r.created_at) > new Date(best.created_at)) ? r : best, null);
        return (
          <StatStrip items={[
            { label: 'Report Types', value: String(REPORT_TYPES.length), sub: 'IP schedule to as-built' },
            { label: 'Formats', value: String(FORMAT_OPTIONS.length), sub: FORMAT_OPTIONS.map((f) => f.toUpperCase()).join(', ') },
            { label: 'Reports Generated', value: String(history.length), sub: history.length ? 'archived in history below' : 'none generated yet' },
            { label: 'Last Export', value: latest ? new Date(latest.created_at).toLocaleDateString() : 'Never', sub: latest ? latest.name : 'one tap builds the first' },
          ]} />
        );
      })()}

      {/* Branding Section */}
      {showBranding && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Custom Branding" icon={<ChartBar size={17} weight="duotone" color={GOLD} />}>
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
          </SectionCard>
        </div>
      )}

      {/* Report Type Cards */}
      <div style={{ marginBottom: 28 }}>
        <SectionCard title="Generate a Report" subtitle="Pick a document, then a format to export" icon={<FileText size={17} weight="duotone" color={GOLD} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {REPORT_TYPES.map(report => (
              <div key={report.type} className="pmHover" style={{ ...reportCardStyle, display: 'flex', flexDirection: 'column' }}>
                {/* left accent bar keyed to the report type color */}
                <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${report.color}, transparent)`, opacity: 0.85 }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <report.icon size={32} weight="regular" color={report.color} />
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
                        background: generating === report.type ? `${report.color}22` : 'rgba(255,255,255,0.05)',
                        color: report.color, border: `1px solid ${report.color}45`,
                        borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
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
        </SectionCard>
      </div>

      {/* Report History */}
      <SectionCard title="Report History" icon={<Archive size={17} weight="duotone" color={GOLD} />} flush>
        {history.length === 0 ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <FileText size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                No reports generated yet
                <span style={{ fontWeight: 400, color: DIM }}> — one tap builds the first document from live project data:</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['ip_schedule', 'cable_schedule', 'as_built'].map(t => {
                  const rt = REPORT_TYPES.find(r => r.type === t);
                  if (!rt) return null;
                  return (
                    <button key={t} onClick={() => generateReport(t)} disabled={generating === t} className="pmBtn"
                      style={{ padding: '6px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: generating === t ? 0.6 : 1 }}>
                      {generating === t ? 'Generating...' : rt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <FlowStrip steps={[
              { title: 'Pick a document', desc: 'six report types above' },
              { title: 'Choose the format', desc: `${selectedFormat.toUpperCase()} selected now` },
              { title: 'Download instantly', desc: 'branded with your logo' },
              { title: 'History archives it', desc: 'every export kept here' },
            ]} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16 }}>
            {history.map(report => (
              <div key={report.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid rgba(255,255,255,0.08)`,
              }}>
                <span style={{ fontSize: 18, display: 'inline-flex', alignItems: 'center' }}>
                  {(() => {
                    const rt = REPORT_TYPES.find(r => r.type === report.report_type);
                    const Icon = rt?.icon || FileText;
                    return <Icon size={18} weight="regular" color={rt?.color || DIM} />;
                  })()}
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
                    padding: '6px 14px', background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}45`,
                    borderRadius: 8, fontSize: 11, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
                  }}
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
