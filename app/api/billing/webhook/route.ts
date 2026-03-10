import { webhookHandler } from '../../../../stripe-billing';
// Stripe requires the raw body for webhook signature verification.
// Next.js App Router streams the body; webhookHandler reads it as text.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export { webhookHandler as POST };
