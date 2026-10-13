/**
 * Online payments — an owner pays the GC's invoice by card or bank (ACH).
 *
 * Stripe Connect, Express accounts: each company connects ITS OWN Stripe
 * account once (Settings → Get Paid Online) and the money lands in its bank.
 * Charges are made directly on the company's account, so Stripe's fees come
 * out of that payment (card 2.9% + 30¢, US bank 0.8% capped at $5) and Saguaro
 * holds no money and takes no cut.
 *
 * What production needs, set by Chad in Vercel (never in code):
 *   STRIPE_SECRET_KEY               the platform's secret key (Connect enabled)
 *   STRIPE_CONNECT_WEBHOOK_SECRET   signing secret of a Connect webhook pointed
 *                                   at /api/payments/webhook ("events on
 *                                   connected accounts": checkout.session.*)
 * Without them every surface says online payments aren't switched on and no
 * Pay button is drawn — nothing pretends to work.
 */
import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2025-02-24.acacia';

/** Is online payment switched on for this deployment at all? */
export function onlinePaymentsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — online payments are not switched on');
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
}

export interface PayableInvoice {
  id: string;
  tenant_id: string;
  project_id: string | null;
  invoice_number: string | null;
  amount: number | string | null;
  tax: number | string | null;
  total: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
  direction: string | null;
}

/** What is still owed on an invoice, in cents. Never negative. */
export function invoiceBalanceCents(inv: Pick<PayableInvoice, 'amount' | 'tax' | 'total' | 'paid_amount'>): number {
  const amount = Number(inv.amount) || 0;
  const tax = Number(inv.tax) || 0;
  const total = Number(inv.total) > 0 ? Number(inv.total) : amount + tax;
  const paid = Number(inv.paid_amount) || 0;
  return Math.max(0, Math.round((total - paid) * 100));
}

/** Can the owner pay this invoice online right now? (The company's account is checked separately.) */
export function invoiceIsPayable(inv: Pick<PayableInvoice, 'direction' | 'status' | 'amount' | 'tax' | 'total' | 'paid_amount'>): boolean {
  const status = String(inv.status || '').toLowerCase();
  if (inv.direction !== 'receivable') return false;              // never a vendor / sub bill
  if (['draft', 'void', 'voided', 'cancelled', 'canceled', 'paid'].includes(status)) return false;
  return invoiceBalanceCents(inv) >= 50;                          // Stripe's minimum charge is $0.50
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Ready means Stripe will take the owner's payment AND pay it out to the
 * company's bank, with nothing overdue: charges_enabled alone let an account
 * whose payouts were held (or with past-due requirements) show as ready.
 * `due` lists what Stripe still needs, overdue items first.
 */
export function accountReadiness(acct: {
  charges_enabled?: boolean | null; payouts_enabled?: boolean | null;
  requirements?: { past_due?: string[] | null; currently_due?: string[] | null; disabled_reason?: string | null } | null;
}): { ready: boolean; due: string[] } {
  const pastDue = acct.requirements?.past_due ?? [];
  const ready = !!acct.charges_enabled && !!acct.payouts_enabled && !pastDue.length && !acct.requirements?.disabled_reason;
  return { ready, due: [...new Set([...pastDue, ...(acct.requirements?.currently_due ?? [])])] };
}

/** The company's connected account, refreshed from Stripe when asked. */
export async function companyPaymentAccount(db: Db, tenantId: string, refresh = false): Promise<{ accountId: string | null; ready: boolean; due: string[] }> {
  const { data: t } = await db.from('tenants').select('stripe_connect_account_id, online_payments_ready').eq('id', tenantId).maybeSingle();
  const accountId: string | null = t?.stripe_connect_account_id ?? null;
  if (!accountId || !refresh || !onlinePaymentsConfigured()) return { accountId, ready: !!t?.online_payments_ready && onlinePaymentsConfigured(), due: [] };
  const acct = await stripeClient().accounts.retrieve(accountId);
  const { ready, due } = accountReadiness(acct);
  if (ready !== !!t?.online_payments_ready) {
    await db.from('tenants').update({ online_payments_ready: ready }).eq('id', tenantId);
  }
  return { accountId, ready, due };
}

/** Start (or continue) Stripe onboarding for a company. Returns the URL to send the admin to. */
export async function onboardingLink(db: Db, tenantId: string, origin: string): Promise<string> {
  const stripe = stripeClient();
  const { data: t } = await db.from('tenants').select('stripe_connect_account_id, name, company_name, owner_email').eq('id', tenantId).maybeSingle();
  let accountId: string | null = t?.stripe_connect_account_id ?? null;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: t?.owner_email || undefined,
      business_profile: { name: t?.company_name || t?.name || undefined, mcc: '1520' }, // general contractors
      capabilities: { card_payments: { requested: true }, transfers: { requested: true }, us_bank_account_ach_payments: { requested: true } },
      metadata: { tenant_id: tenantId },
    });
    accountId = acct.id;
    const { error } = await db.from('tenants').update({ stripe_connect_account_id: accountId }).eq('id', tenantId);
    if (error) throw error;
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/app/settings/payments?resume=1`,
    return_url: `${origin}/app/settings/payments?back=1`,
    type: 'account_onboarding',
  });
  return link.url;
}

/** A Stripe Checkout page for what is owed on one owner invoice, on the company's own account. */
export async function invoiceCheckoutUrl(db: Db, inv: PayableInvoice, origin: string, returnPath: string): Promise<string> {
  const { accountId, ready } = await companyPaymentAccount(db, inv.tenant_id);
  if (!accountId || !ready) throw new PaymentsUnavailable('This contractor has not switched on online payments yet.');
  if (!invoiceIsPayable(inv)) throw new PaymentsUnavailable('This invoice has nothing left to pay online.');
  const cents = invoiceBalanceCents(inv);
  const label = inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Invoice';
  const sep = returnPath.includes('?') ? '&' : '?';
  const session = await stripeClient().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'us_bank_account'],
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, product_data: { name: label } } }],
    success_url: `${origin}${returnPath}${sep}paid=1`,
    cancel_url: `${origin}${returnPath}`,
    metadata: { kind: 'invoice', tenant_id: inv.tenant_id, project_id: inv.project_id ?? '', invoice_id: inv.id },
    payment_intent_data: { metadata: { kind: 'invoice', tenant_id: inv.tenant_id, invoice_id: inv.id } },
  }, { stripeAccount: accountId });
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return session.url;
}

/** Our words for the owner — safe to show (see lib/api-error: our own error classes may return their message). */
export class PaymentsUnavailable extends Error {}

/**
 * Record a completed checkout: one portal_payments row (unique per session, so
 * a re-delivered webhook can't count it twice) and the invoice's paid amount.
 * Returns false when it was already recorded.
 */
export async function recordInvoicePayment(db: Db, s: { id: string; amount_total: number | null; metadata: Record<string, string> | null; payment_method_types?: string[] }): Promise<boolean> {
  const meta = s.metadata || {};
  if (meta.kind !== 'invoice' || !meta.invoice_id || !meta.tenant_id) return false;
  const amount = (s.amount_total ?? 0) / 100;
  const method = (s.payment_method_types || []).includes('us_bank_account') && !(s.payment_method_types || []).includes('card') ? 'ach' : 'online';
  const { data: inv } = await db.from('invoices').select('id, tenant_id, project_id, amount, tax, total, paid_amount, direction')
    .eq('id', meta.invoice_id).eq('tenant_id', meta.tenant_id).maybeSingle();
  if (!inv) throw new Error(`invoice ${meta.invoice_id} not found for tenant ${meta.tenant_id}`);
  const now = new Date().toISOString();
  const { error: payErr } = await db.from('portal_payments').insert({
    tenant_id: inv.tenant_id, project_id: inv.project_id, invoice_id: inv.id, amount,
    payment_type: 'invoice', status: 'paid', paid_at: now, stripe_session_id: s.id, method,
    notes: 'Paid online through Stripe',
  });
  if (payErr) {
    if (String(payErr.code) === '23505') return false; // this session is already on the books
    throw payErr;
  }
  const paid = (Number(inv.paid_amount) || 0) + amount;
  const settled = invoiceBalanceCents({ ...inv, paid_amount: paid }) === 0;
  const { error: upErr } = await db.from('invoices').update({
    paid_amount: paid,
    status: settled ? 'paid' : 'partially_paid',
    paid_at: settled ? now : null,
    payment_method: 'online',
    updated_at: now,
  }).eq('id', inv.id).eq('tenant_id', inv.tenant_id);
  if (upErr) throw upErr;
  return true;
}
