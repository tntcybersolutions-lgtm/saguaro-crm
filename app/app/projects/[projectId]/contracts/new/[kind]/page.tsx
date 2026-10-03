'use client';
import React, { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ArrowLeft, CheckCircle, DownloadSimple } from '@phosphor-icons/react';
import ContractForm from '@/components/contracts/ContractForm';
import ESignatureFlow from '@/components/ESignatureFlow';
import ContractVersions from '@/components/contracts/ContractVersions';
import ContractCompare from '@/components/contracts/ContractCompare';
import { CONTRACT_FORMS, type ContractKind } from '@/lib/document-templates/contract-fields';
import { openPdf } from '@/components/PdfViewer';

/**
 * Paper a contract from a template.
 *
 * A page of its own rather than another mode on the 551-line contracts screen:
 * it is linkable (a bid package can send you straight here with the sub and the
 * scope already chosen), it cannot break what is already working there, and the
 * URL says what you are doing.
 *
 * The form collects; this decides where it goes. Each contract kind has its own
 * generator route and its own body shape, which is why the mapping lives here
 * and not in the form.
 */

const GOLD = 'var(--brand-primary)';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const BASE = 'var(--bg-base)';

/** What the signature tables call each kind. */
const SIGN_DOC_TYPE: Record<ContractKind, 'subcontract' | 'change_order' | 'purchase_order' | 'prime_contract'> = {
  subcontract: 'subcontract',
  'change-order': 'change_order',
  'purchase-order': 'purchase_order',
  'prime-contract': 'prime_contract',
};

/** Where each contract kind is generated, and how its route wants the values. */
function buildRequest(
  kind: ContractKind,
  projectId: string,
  ids: { subId?: string; bidPackageId?: string; changeOrderId?: string },
  v: Record<string, unknown>,
): { url: string; body: Record<string, unknown> } {
  switch (kind) {
    case 'purchase-order':
      /* This route already took explicit fields long before the form existed,
         so the values map straight onto its own names rather than going through
         an overrides bag. */
      return {
        url: '/api/documents/purchase-order',
        body: {
          projectId,
          buyerName: v.contractorName,
          vendorName: v.vendorName,
          vendorAddress: v.vendorAddress,
          shipTo: v.shipTo,
          description: v.description,
          poAmount: v.poAmount,
          terms: v.paymentTerms,
          taxable: v.taxable,
          freightTerms: v.freightTerms,
          requiredDeliveryDate: v.deliveryDate,
        },
      };
    case 'change-order':
      return { url: '/api/documents/g701', body: { projectId, changeOrderId: ids.changeOrderId, overrides: v } };
    case 'prime-contract':
      return { url: '/api/documents/a101', body: { projectId, overrides: v } };
    case 'subcontract':
    default:
      return {
        url: '/api/documents/subcontract',
        body: { projectId, subId: ids.subId, bidPackageId: ids.bidPackageId, overrides: v },
      };
  }
}

export default function NewContractFromTemplate() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();

  const projectId = String(params['projectId'] || '');
  const kind = String(params['kind'] || '') as ContractKind;
  const subId = search.get('subId') || undefined;
  const bidPackageId = search.get('bidPackageId') || undefined;
  const changeOrderId = search.get('changeOrderId') || undefined;

  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  /* Bumped after each generate so the history picks up the version just made. */
  const [generation, setGeneration] = useState(0);

  const base = `/app/projects/${projectId}/contracts`;
  const spec = CONTRACT_FORMS[kind];

  if (!spec) {
    return (
      <main style={{ background: BASE, minHeight: '100vh', padding: '28px max(20px, 4vw)' }}>
        <p style={{ color: TEXT, fontSize: 15 }}>
          There is no contract template called “{String(params['kind'])}”.{' '}
          <Link href={base} style={{ color: GOLD }}>Back to Contracts</Link>
        </p>
      </main>
    );
  }

  const generate = async (values: Record<string, unknown>) => {
    setError('');
    const { url, body } = buildRequest(kind, projectId, { subId, bidPackageId, changeOrderId }, values);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The contract could not be generated.');
    const link = data.pdfUrl || data.url || '';
    if (!link) throw new Error('The contract was generated but no document came back.');
    setPdfUrl(link);
    setGeneration((n) => n + 1);
  };

  return (
    <main style={{ background: BASE, minHeight: '100vh', padding: '24px max(20px, 4vw) 64px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Link href={base} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, color: DIM, fontSize: 13.5, textDecoration: 'none' }}>
          <ArrowLeft size={15} weight="bold" color={DIM} /> Contracts
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 22px' }}>
          <FileText size={20} weight="duotone" color={GOLD} />
          <h1 style={{ margin: 0, color: TEXT, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
            New {spec.title}
          </h1>
        </div>

        {pdfUrl ? (
          /* Generated. The document is the point, so it gets the whole screen —
             and the GC can go straight back and change something if it is wrong. */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#22C55E', fontSize: 15, fontWeight: 700 }}>
              <CheckCircle size={18} weight="fill" color="#22C55E" />
              {spec.title} generated
            </div>

            <iframe
              src={pdfUrl}
              title={`${spec.title} preview`}
              style={{ width: '100%', height: '72vh', border: `1px solid ${BORDER}`, borderRadius: 12, background: '#fff' }}
            />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openPdf({ url: pdfUrl, title: 'Contract' })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 22px', borderRadius: 9, background: GOLD, color: '#0A0A00', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                <DownloadSimple size={16} weight="bold" color="#0A0A00" /> Open the PDF
              </button>
              <button onClick={() => setSigning((v) => !v)}
                style={{ minHeight: 44, padding: '0 22px', borderRadius: 9, background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                {signing ? 'Hide Signing' : 'Send for Signature'}
              </button>
              <button onClick={() => setPdfUrl('')}
                style={{ minHeight: 44, padding: '0 20px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Change Something and Regenerate
              </button>
              <button onClick={() => router.push(base)}
                style={{ minHeight: 44, padding: '0 20px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </div>

            <ContractCompare
              projectId={projectId}
              pdfUrl={pdfUrl}
              title={spec.title}
              /* Tagged by kind rather than by generation, so every marked-up
                 copy of this contract on this project stays together across
                 regenerations. */
              entityId={`${projectId}:${kind}`}
            />

            <ContractVersions projectId={projectId} kind={kind} refreshKey={generation} />

            {signing && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
                <ESignatureFlow
                  projectId={projectId}
                  docType={SIGN_DOC_TYPE[kind]}
                  docTitle={spec.title}
                  pdfUrl={pdfUrl}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {error && <p style={{ color: '#EF4444', fontSize: 13.5 }}>{error}</p>}
            <ContractForm
              kind={kind}
              projectId={projectId}
              subId={subId}
              bidPackageId={bidPackageId}
              onGenerate={generate}
              onCancel={() => router.push(base)}
            />
          </>
        )}
      </div>
    </main>
  );
}
