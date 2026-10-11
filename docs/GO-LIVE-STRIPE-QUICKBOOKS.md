# docs/GO-LIVE-STRIPE-QUICKBOOKS.md — Stripe + QuickBooks go-live (do both together)

Chad's decision (2026-10-11): QuickBooks is switched on **in the same sitting as Stripe**.
When Chad says "stripe in" (or starts Stripe), walk him through BOTH lists below.
Never ask him to paste a key in chat — he enters every secret in Vercel himself.

## How QuickBooks works for every GC (white-box sales — never Chad's books)

- Saguaro registers ONE Intuit developer app (free; a developer login, not a QuickBooks
  company). That app's Client ID/Secret identify the Saguaro software to Intuit — like
  Stripe's platform key. Chad's own QuickBooks company is never used.
- Each GC taps Settings → Integrations → QuickBooks → Connect in THEIR Saguaro account,
  signs in with THEIR OWN QuickBooks login and picks THEIR company file.
- The callback (`app/api/integrations/quickbooks/callback/route.ts`) stores the tokens +
  realm id on that GC's `integrations` row (tenant from the session only). Send to
  QuickBooks pushes that GC's approved/certified/paid pay apps as invoices to the job
  owner, and subs as vendors, into the GC's own QuickBooks. Tenant-isolated.
- Intuit's consent screen shows the app name Chad registers ("Saguaro").
- Until the keys are set, `isQuickBooksConfigured()` is false and QuickBooks is hidden
  everywhere (no dead button).

## Chad's steps — QuickBooks (once, serves every GC)

1. developer.intuit.com → sign up with the Saguaro business email.
2. Create an app → QuickBooks Online Accounting → name it **Saguaro**.
3. Redirect URI: `https://www.saguarocontrol.net/api/integrations/quickbooks/callback`
4. Complete Intuit's production checklist (privacy URL https://saguarocontrol.net/privacy,
   terms URL https://saguarocontrol.net/terms, short questionnaire) → production Client ID + Client Secret.
5. Vercel → saguaro-crm → Settings → Environment Variables (Production, Sensitive):
   `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT=production`
   (`QUICKBOOKS_REDIRECT_URI` optional; it defaults to the URI above via `NEXT_PUBLIC_APP_URL`).

## Chad's steps — Stripe

1. Stripe (LIVE mode) → Developers → API keys → Secret key — from the account that owns
   the `plans` price ids (Starter, Professional: `stripe_price_id_monthly/annual`).
2. Vercel (Production, Sensitive): `STRIPE_SECRET_KEY`.
3. Stripe → Developers → Webhooks → Add endpoint
   `https://www.saguarocontrol.net/api/billing/webhook`, events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
4. That endpoint's signing secret → Vercel `STRIPE_WEBHOOK_SECRET` (Production, Sensitive).

## Then (Claude)

- Env vars only take effect on a new deployment: redeploy production once Chad says go.
- Verify: `GET /api/billing/status` → `checkoutEnabled: true`; a checkout session opens for
  a plan (no charge); QuickBooks shows Connect; connect Intuit's free **sandbox** company
  (never real books) and send one ZZ AUDIT pay app.
- iPhone app shows NO purchase UI (App Store 3.1.1 — PR #115, `lib/use-in-app.ts`);
  QuickBooks sign-in stays in the app (app-bound Intuit domains, PR #114, build 1042+).
- Still to check on Chad's real iPhone (TestFlight build 1042): offline mode (open a job
  online → Airplane Mode → reopen app → screens show; photo taken offline uploads when
  back online) and QuickBooks Connect end to end.
