'use client';
/**
 * Public invoice page — what a vendor sees from the email link. Read-only,
 * token-addressed (no login wall), branded, with a Download PDF action.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const GOLD = 'var(--brand-primary)';
const BG = 'var(--bg-base)';
const CARD = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.09)';
const TEXT = '#F4F4F5';
const DIM = 'var(--text-secondary)';

interface PublicInvoice {
  invoiceNumber: string;
  vendorName: string | null;
  description: string | null;
  amount: number;
  tax: number;
  total: number;
  dueDate: string | null;
  status: string;
  notes: string | null;
  issuedAt: string | null;
}

const money = (n: number) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const day = (v: string | null) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [from, setFrom] = useState('');
  const [projectName, setProjectName] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [payOnline, setPayOnline] = useState(false);
  const [balance, setBalance] = useState(0);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [paidBack, setPaidBack] = useState(false);
  useEffect(() => { setPaidBack(new URLSearchParams(window.location.search).get('paid') === '1'); }, []);
  const pay = async () => {
    setPaying(true); setPayErr('');
    try {
      const r = await fetch('/api/portal/invoice/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.token }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setPayErr(d.error || "Couldn't open the payment page. Nothing was charged.");
    } catch { setPayErr("Couldn't reach the payment page. Check your connection — nothing was charged."); }
    setPaying(false);
  };

  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/portal/invoice?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.invoice) {
          setInv(d.invoice); setFrom(d.from || ''); setProjectName(d.projectName || null); setPdfUrl(d.pdfUrl || null);
          setPayOnline(!!d.payOnline); setBalance(Number(d.balance) || 0);
        } else setErr(d?.error || 'This invoice link is not valid.');
      })
      .catch(() => setErr('Could not load the invoice.'));
  }, [params?.token]);

  const statusColor = inv?.status === 'paid' ? '#34D27B' : inv?.status === 'sent' || inv?.status === 'pending' ? GOLD : DIM;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(180deg, ${GOLD}, var(--brand-primary-hover))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0A00', fontWeight: 900, fontSize: 15 }}>S</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{from || 'Invoice'}</div>
            {projectName && <div style={{ fontSize: 12, color: DIM }}>{projectName}</div>}
          </div>
        </div>

        {err && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, textAlign: 'center', color: DIM }}>{err}</div>
        )}

        {inv && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: DIM }}>Invoice</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{inv.invoiceNumber}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: statusColor, border: `1px solid color-mix(in srgb, ${statusColor} 33%, transparent)`, background: `color-mix(in srgb, ${statusColor} 10%, transparent)`, borderRadius: 999, padding: '4px 12px' }}>{inv.status}</span>
            </div>

            <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
              {inv.vendorName && <Row label="Billed To" value={inv.vendorName} />}
              {inv.description && <Row label="Description" value={inv.description} />}
              {inv.issuedAt && <Row label="Issued" value={day(inv.issuedAt) || ''} />}
              {inv.dueDate && <Row label="Due" value={day(inv.dueDate) || ''} />}
            </div>

            <div style={{ margin: '0 22px', borderTop: `1px solid ${BORDER}` }} />
            <div style={{ padding: '16px 22px', display: 'grid', gap: 8 }}>
              <Row label="Amount" value={money(inv.amount)} />
              {inv.tax > 0 && <Row label="Tax" value={money(inv.tax)} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `color-mix(in srgb, ${GOLD} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${GOLD} 25%, transparent)`, borderRadius: 10, padding: '12px 14px' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: DIM }}>Total Due</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{money(inv.total)}</span>
              </div>
            </div>

            {inv.notes && (
              <div style={{ padding: '0 22px 16px', fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>{inv.notes}</div>
            )}

            {paidBack && (
              <div role="status" style={{ margin: '0 22px 12px', padding: '12px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--success) 45%, transparent)', fontWeight: 700 }}>
                Thank you — your payment went through. Card payments show as paid within a minute; bank payments clear in a few business days.
              </div>
            )}
            {payErr && <div role="alert" style={{ margin: '0 22px 12px', padding: '12px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)', fontWeight: 700 }}>{payErr}</div>}
            <div style={{ padding: '16px 22px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {payOnline && !paidBack && (
                <button type="button" onClick={pay} disabled={paying} style={{ minHeight: 44, padding: '0 22px', borderRadius: 10, border: 'none', background: GOLD, color: 'var(--on-brand)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                  {paying ? 'Opening…' : `Pay ${balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} — card or bank`}
                </button>
              )}
              {pdfUrl ? (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(180deg, var(--brand-primary-strong), ${GOLD} 60%, var(--brand-primary-hover))`, color: '#0A0A00', fontWeight: 800, fontSize: 14, borderRadius: 10, padding: '11px 20px', textDecoration: 'none', boxShadow: '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' }}>
                  Download PDF
                </a>
              ) : (
                <span style={{ fontSize: 12, color: DIM }}>A PDF copy is available on request.</span>
              )}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: DIM }}>
          Powered by Saguaro Control Systems
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: DIM, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
