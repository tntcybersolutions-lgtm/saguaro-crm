'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface ComplianceSub {
  id: string;
  name: string;
  trade: string;
  contract_amount: number;
  coi_status: string;
  coi_expiry: string | null;
  license_status: string;
  license_number: string;
  w9_status: string;
  is_prevailing_wage: boolean;
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'red' | 'muted'> = {
  active: 'green', on_file: 'green', current: 'green', valid: 'green',
  expiring: 'amber', pending: 'amber',
  expired: 'red', missing: 'red', invalid: 'red',
  not_requested: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', on_file: 'On File', current: 'Current', valid: 'Valid',
  expiring: 'Expiring', pending: 'Pending',
  expired: 'Expired', missing: 'Missing', invalid: 'Invalid',
  not_requested: 'Not Requested',
};

export default function CompliancePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [subs, setSubs] = useState<ComplianceSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isPublicProject, setIsPublicProject] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project || data;
      setIsPublicProject(project.is_public || project.prevailing_wage || false);
      const subList = project.subcontractors || project.subs || [];
      setSubs(subList.map((s: any) => ({
        id: s.id || s.sub_id,
        name: s.name || s.company_name,
        trade: s.trade || s.specialty || '',
        contract_amount: s.contract_amount || 0,
        coi_status: s.coi_status || 'pending',
        coi_expiry: s.coi_expiry || s.coi_expiration || null,
        license_status: s.license_status || 'pending',
        license_number: s.license_number || '',
        w9_status: s.w9_status || 'pending',
        is_prevailing_wage: s.is_prevailing_wage || false,
      })));
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const compliantCount = subs.filter(s => s.coi_status === 'active' && s.license_status !== 'expired' && s.license_status !== 'missing').length;
  const expiredCOIs = subs.filter(s => s.coi_status === 'expired' || s.coi_status === 'expiring').length;
  const missingLicenses = subs.filter(s => s.license_status === 'missing' || s.license_status === 'expired').length;
  const wageViolations = subs.filter(s => s.is_prevailing_wage && isPublicProject).length;

  async function requestCOI(subId: string, subName: string) {
    try {
      await fetch('/api/insurance/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, projectId }),
      });
      setToast(`COI request sent to ${subName}`);
    } catch {
      setToast(`Failed to send COI request to ${subName}`);
    }
    setTimeout(() => setToast(''), 4000);
  }

  async function generatePrevailingWage() {
    try {
      const res = await fetch('/api/documents/prevailing-wage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      const url = data.url || data.pdfUrl;
      if (url) window.open(url, '_blank');
      setToast('Prevailing wage rate sheet generated.');
    } catch {
      setToast('Prevailing wage rate sheet request sent.');
    }
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Compliance Dashboard"
          sub={`Insurance, licensing, and wage compliance - ${subs.length} subcontractors`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              {isPublicProject && (
                <Btn variant="ghost" onClick={generatePrevailingWage}>Generate Prevailing Wage Rate Sheet</Btn>
              )}
              <Btn onClick={async () => {
                try {
                  await fetch('/api/insurance/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId }),
                  });
                  setToast('COI request emails sent to all subcontractors.');
                } catch {
                  setToast('Failed to send COI requests.');
                }
                setTimeout(() => setToast(''), 4000);
              }}>
                Request All COIs
              </Btn>
            </div>
          }
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="✅" label="Compliant Subs" value={String(compliantCount)} />
          <StatCard icon="🔴" label="Expired COIs" value={String(expiredCOIs)} />
          <StatCard icon="📋" label="Missing Licenses" value={String(missingLicenses)} />
          <StatCard icon="⚠️" label="Wage Flags" value={String(wageViolations)} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {isPublicProject && (
          <Card style={{ marginBottom: 24, borderColor: 'rgba(245,158,11,0.3)' }}>
            <CardBody>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge label="Public Project" color="amber" />
                <span style={{ fontSize: 13, color: T.amber }}>Prevailing wage requirements apply to this project.</span>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Subcontractor Compliance</span></CardHeader>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Subcontractor', 'Trade', 'Contract', 'COI Status', 'COI Expiry', 'License', 'W-9', 'Actions']}
                rows={subs.map(s => [
                  <span key="n" style={{ fontWeight: 600 }}>{s.name}</span>,
                  <span key="t" style={{ color: T.muted }}>{s.trade}</span>,
                  <span key="c" style={{ color: T.white }}>${s.contract_amount.toLocaleString()}</span>,
                  <Badge key="cs" label={STATUS_LABEL[s.coi_status] || s.coi_status} color={STATUS_BADGE[s.coi_status] || 'muted'} />,
                  <span key="ce" style={{ color: s.coi_status === 'expired' ? T.red : s.coi_status === 'expiring' ? T.amber : T.muted, whiteSpace: 'nowrap' }}>
                    {s.coi_expiry || '---'}
                  </span>,
                  <Badge key="ls" label={STATUS_LABEL[s.license_status] || s.license_status} color={STATUS_BADGE[s.license_status] || 'muted'} />,
                  <Badge key="ws" label={STATUS_LABEL[s.w9_status] || s.w9_status} color={STATUS_BADGE[s.w9_status] || 'muted'} />,
                  <div key="act" style={{ display: 'flex', gap: 6 }}>
                    {(s.coi_status === 'expired' || s.coi_status === 'expiring') && (
                      <Btn size="sm" variant="ghost" onClick={() => requestCOI(s.id, s.name)}>Request COI</Btn>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
