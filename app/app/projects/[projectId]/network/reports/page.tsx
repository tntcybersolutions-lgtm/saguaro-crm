'use client';
/**
 * Network › Reports — IP schedules, cable schedules, port maps, WiFi surveys,
 * as-builts and an executive summary, exported as PDF / Excel / CSV with the
 * company's branding, plus the history of every export.
 *
 * Reads  GET  /api/network/projects?projectId=  →  GET /api/network/reports?networkProjectId=
 * Writes POST /api/network/reports   { network_project_id, report_type, format, branding }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { openPdf } from '@/components/PdfViewer';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, StatRow, Button, Card, DataTable, EmptyState, Select, Field, Input, FormGrid, Toast, useToast,
  type Column, type StatItem,
} from '@/components/ui/kit';
import { Clipboard, Plug, Shuffle, WifiHigh, Ruler, ChartBar, FileText, Archive, Palette, DownloadSimple, WarningCircle, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import NetworkTabs, { networkCrumbs } from '../_components/NetworkTabs';

interface ReportHistory {
  id: string;
  report_type: string;
  name: string;
  format: string;
  download_url: string;
  created_at: string;
  file_size: number;
}

const REPORT_TYPES: { type: string; label: string; icon: PhosphorIcon; description: string }[] = [
  { type: 'ip_schedule', label: 'IP Schedule', icon: Clipboard, description: 'Every IP assignment across devices, VLANs and reserved addresses.' },
  { type: 'cable_schedule', label: 'Cable Schedule', icon: Plug, description: 'Run labels, types, from/to, lengths and test results.' },
  { type: 'port_map', label: 'Port Map', icon: Shuffle, description: 'Switch ports with connected devices, VLANs and PoE.' },
  { type: 'wifi_survey', label: 'WiFi Survey', icon: WifiHigh, description: 'AP locations, channels, power and coverage estimates.' },
  { type: 'as_built', label: 'As-Built Documentation', icon: Ruler, description: 'Topology, device configs and cable routes as installed.' },
  { type: 'executive_summary', label: 'Executive Summary', icon: ChartBar, description: 'Equipment counts, costs, timeline and key metrics.' },
];

const FORMAT_OPTIONS = ['pdf', 'excel', 'csv'];
const FORMAT_LABELS: Record<string, string> = { pdf: 'PDF', excel: 'Excel', csv: 'CSV' };
const formatLabel = (f: string) => FORMAT_LABELS[f] || (f || '').toUpperCase();

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const CSS = `
.netRpts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.netRpt { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md, 12px); background: var(--bg-surface-2); }
.netRptHead { display: flex; gap: 12px; align-items: flex-start; }
.netRptTitle { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.netRptDesc { font-size: 13px; color: var(--text-secondary); line-height: 1.45; margin-top: 2px; }
.netRptBtns { display: flex; gap: 8px; margin-top: auto; }
.netRptBtns > .k-btn { flex: 1 1 0; justify-content: center; }
`;

export default function ReportsPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);
  const { toast, show } = useToast();
  const [networkProjectId, setNetworkProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [generating, setGenerating] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [showBranding, setShowBranding] = useState(false);
  const [branding, setBranding] = useState({
    company_name: '', logo_url: '', // These feed <input type="color"> and are sent to the report API.
    primary_color: 'var(--warning)', secondary_color: 'var(--warning)',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const npRes = await fetch(`/api/network/projects?projectId=${projectId}`);
      const npData = await npRes.json();
      if (!npData.networkProject) { setLoading(false); return; }
      setNetworkProjectId(npData.networkProject.id);

      const histRes = await fetch(`/api/network/reports?networkProjectId=${npData.networkProject.id}`);
      const histData = await histRes.json();
      setHistory(histData.reports || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load reports");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** `format` is the button the person tapped; it defaults to the header's format. */
  const generateReport = async (reportType: string, format: string = selectedFormat) => {
    if (!networkProjectId) return;
    setGenerating(reportType);
    try {
      const res = await fetch('/api/network/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network_project_id: networkProjectId,
          report_type: reportType,
          format,
          branding,
        }),
      });
      const data = await res.json();
      if (data.download_url) {
        openPdf({ url: data.download_url, title: 'Network Report' });
      } else if (!res.ok) {
        show(data.error || "Couldn't generate the report", 'bad');
      }
      fetchData();
    } catch {
      show("Couldn't generate the report", 'bad');
    }
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

  const latest = history.reduce<ReportHistory | null>((best, r) => (!best || new Date(r.created_at) > new Date(best.created_at)) ? r : best, null);
  const stats: StatItem[] = [
    { label: 'Report types', value: String(REPORT_TYPES.length), sub: 'IP schedule to as-built', icon: <FileText size={15} /> },
    { label: 'Formats', value: String(FORMAT_OPTIONS.length), sub: FORMAT_OPTIONS.map(formatLabel).join(', '), icon: <DownloadSimple size={15} /> },
    { label: 'Reports generated', value: loading ? '—' : String(history.length), sub: history.length ? 'Archived in history' : 'None yet', icon: <Archive size={15} /> },
    { label: 'Last export', value: loading ? '—' : latest ? new Date(latest.created_at).toLocaleDateString() : 'Never', sub: latest ? latest.name : undefined, icon: <ChartBar size={15} /> },
  ];

  const typeOf = (t: string) => REPORT_TYPES.find(r => r.type === t);
  const openReport = (r: ReportHistory) => { if (r.download_url) window.open(r.download_url, '_blank', 'noopener,noreferrer'); };

  const columns: Column<ReportHistory>[] = [
    { key: 'name', header: 'Report', primary: true, phone: 'show', render: (r) => {
      const I = typeOf(r.report_type)?.icon || FileText;
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><I size={15} />{r.name}</span>;
    } },
    { key: 'report_type', header: 'Type', accessor: (r) => typeOf(r.report_type)?.label || r.report_type },
    { key: 'format', header: 'Format', phone: 'show', accessor: (r) => formatLabel(r.format) },
    { key: 'file_size', header: 'Size', align: 'right', render: (r) => formatFileSize(r.file_size || 0) },
    { key: 'created_at', header: 'Generated', phone: 'show', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageShell
      crumbs={networkCrumbs(projectId, ctx?.project?.name, 'Reports')}
      title="Network reports"
      subtitle="IP schedules, cable schedules, port maps and as-builts."
      actions={
        <>
          <Select aria-label="Format" value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} style={{ width: 'auto', minWidth: 110 }}
            options={FORMAT_OPTIONS.map(f => ({ value: f, label: formatLabel(f) }))} />
          <Button icon={<Palette size={15} />} onClick={() => setShowBranding(!showBranding)}>{showBranding ? 'Hide branding' : 'Branding'}</Button>
          <Button variant="primary" icon={<Ruler size={15} />} onClick={() => generateReport('as_built')} disabled={generating === 'as_built' || !networkProjectId}>
            {generating === 'as_built' ? 'Generating…' : `As-built (${formatLabel(selectedFormat)})`}
          </Button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <NetworkTabs projectId={projectId} value="reports" />

      {loadError ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load reports" text={loadError} action={<Button onClick={fetchData}>Try again</Button>} />
      ) : (
        <>
          <StatRow items={stats} />

          {showBranding && (
            <Card title="Custom branding" icon={<Palette size={16} />}>
              <FormGrid cols={4}>
                <Field label="Company name">
                  <Input value={branding.company_name} onChange={e => setBranding({ ...branding, company_name: e.target.value })} placeholder="Your Company" />
                </Field>
                <Field label="Logo">
                  <Input type="file" accept="image/*" onChange={handleLogoUpload} />
                </Field>
                <Field label="Primary color">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" aria-label="Pick primary color" value={branding.primary_color} onChange={e => setBranding({ ...branding, primary_color: e.target.value })} style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }} />
                    <Input value={branding.primary_color} onChange={e => setBranding({ ...branding, primary_color: e.target.value })} />
                  </div>
                </Field>
                <Field label="Secondary color">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" aria-label="Pick secondary color" value={branding.secondary_color} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })} style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }} />
                    <Input value={branding.secondary_color} onChange={e => setBranding({ ...branding, secondary_color: e.target.value })} />
                  </div>
                </Field>
              </FormGrid>
              {branding.logo_url && (
                <div style={{ marginTop: 12 }}>
                  <img src={branding.logo_url} alt="Logo preview" style={{ height: 40, borderRadius: 4 }} />
                </div>
              )}
            </Card>
          )}

          <Card title="Generate a report" icon={<FileText size={16} />}>
            <div className="netRpts">
              {REPORT_TYPES.map(report => (
                <div key={report.type} className="netRpt">
                  <div className="netRptHead">
                    <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}><report.icon size={24} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="netRptTitle">{report.label}</div>
                      <div className="netRptDesc">{report.description}</div>
                    </div>
                  </div>
                  <div className="netRptBtns">
                    {FORMAT_OPTIONS.map(fmt => (
                      <Button
                        key={fmt}
                        size="sm"
                        disabled={generating === report.type || !networkProjectId}
                        onClick={() => { setSelectedFormat(fmt); generateReport(report.type, fmt); }}
                      >
                        {generating === report.type ? '…' : formatLabel(fmt)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Report history" icon={<Archive size={16} />} flush>
            <DataTable<ReportHistory>
              tableId="project-network-reports"
              exportName="network-reports"
              columns={columns}
              rows={history}
              loading={loading}
              rowKey={(r) => r.id}
              defaultSort={{ key: 'created_at', dir: 'desc' }}
              onRowClick={openReport}
              rowActions={(r) => [{ label: 'Download', icon: <DownloadSimple size={14} />, inline: true, disabled: !r.download_url, onClick: () => openReport(r) }]}
              empty={
                <EmptyState
                  icon={<FileText size={22} />}
                  title="No reports generated yet"
                  text="One tap builds the first document from live job data."
                  action={
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['ip_schedule', 'cable_schedule', 'as_built'].map(t => (
                        <Button key={t} size="sm" onClick={() => generateReport(t)} disabled={generating === t || !networkProjectId}>
                          {generating === t ? 'Generating…' : typeOf(t)?.label}
                        </Button>
                      ))}
                    </div>
                  }
                />
              }
            />
          </Card>
        </>
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
