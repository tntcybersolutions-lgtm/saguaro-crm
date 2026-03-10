# Saguaro CRM — Complete Setup Guide
## From Zero to Production in 30 Minutes

---

## STEP 1: Supabase Database (5 minutes)

1. Go to [app.supabase.com](https://app.supabase.com)
2. Create a new project (or use existing)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Open `SAGUARO_COMPLETE_SETUP.sql` from this folder
6. Select all (Ctrl+A), copy, paste into the SQL editor
7. Click **Run**
8. Wait ~30 seconds — you should see "Success. No rows returned"

**What this creates:** 74 tables, 100 indexes, 73 RLS policies, 14 views, all with tenant isolation

---

## STEP 2: Supabase Storage (2 minutes)

1. Still in Supabase SQL Editor
2. Open `SAGUARO_STORAGE_SETUP.sql`
3. Copy and paste into SQL editor
4. Click **Run**

**What this creates:** 4 storage buckets (documents, blueprints, project-photos, signatures)

---

## STEP 3: Get Your API Keys (10 minutes)

### Supabase Keys
- Go to your Supabase project → **Settings → API**
- Copy: **Project URL**, **anon/public key**, **service_role key**

### Anthropic (Claude AI)
- Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- Create new key → copy it

### Stripe
- Go to [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
- Copy **Secret key** and **Publishable key**
- Go to **Webhooks → Add Endpoint**
  - URL: `https://YOUR-DOMAIN.com/api/billing/webhook`
  - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
  - Copy **Signing secret**

### Resend (Email)
- Go to [resend.com](https://resend.com) → Sign up free
- **Domains → Add Domain** → verify your domain (adds a DNS record)
- **API Keys → Create API Key** → copy it

---

## STEP 4: Set Environment Variables (5 minutes)

Copy `.env.production.example` to `.env.local` and fill in:

```bash
cp .env.production.example .env.local
```

**Minimum required variables:**
```
NEXT_PUBLIC_SUPABASE_URL=           # from Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # from Supabase
SUPABASE_SERVICE_ROLE_KEY=          # from Supabase
ANTHROPIC_API_KEY=                  # from Anthropic
STRIPE_SECRET_KEY=                  # from Stripe
STRIPE_PUBLISHABLE_KEY=             # from Stripe
STRIPE_WEBHOOK_SECRET=              # from Stripe webhook
RESEND_API_KEY=                     # from Resend
EMAIL_FROM=                         # e.g. Saguaro CRM <noreply@yourverifieddomain.com>
EMAIL_REPLY_TO=                     # your main contact email
SAGUARO_API_SECRET=                 # run: openssl rand -hex 32
AUTOPILOT_CRON_SECRET=              # run: openssl rand -hex 32
NEXT_PUBLIC_APP_URL=                # your app URL
NEXT_PUBLIC_SANDBOX_URL=            # your sandbox URL
```

---

## STEP 5: Deploy to Vercel (3 minutes)

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel

# Or push to GitHub and connect repo in Vercel dashboard
git add .
git commit -m "Saguaro CRM production build"
git push origin main
```

**In Vercel Dashboard:**
1. Go to your project → **Settings → Environment Variables**
2. Add all variables from `.env.local`
3. Redeploy

---

## STEP 6: Post-Deploy One-Time Setup (2 minutes)

After your first successful deploy, run these once:

```bash
# Seed the document template library (AIA forms, lien waivers, etc.)
curl -X POST https://YOUR-DOMAIN.com/api/documents/seed-templates \
  -H "Authorization: Bearer YOUR_SAGUARO_API_SECRET"

# Expected response: {"success": true, "message": "Document templates seeded."}
```

---

## STEP 7: Verify Everything Works (2 minutes)

```bash
# Run the production verification script
npx tsx scripts/verify-deployment.ts
```

Should show all green checkmarks. Fix any ❌ items.

---

## DONE — Your Saguaro CRM is Live

Test it by:
1. Going to `https://YOUR-DOMAIN.com/sandbox` → sign up with an email
2. You should get a welcome email within 30 seconds
3. The sandbox demo project and AI takeoff should load automatically

---

## Cron Jobs (Automatic)

`vercel.json` configures these to run daily:

| Time | Job | What it does |
|---|---|---|
| 7am UTC | Autopilot | Scans all projects for risk alerts |
| 8am UTC | Insurance | Alerts PM on expiring COIs |
| 9am UTC | Sandbox | Sends day 7, day 12, expiry emails |

No setup needed — Vercel runs these automatically.

---

## Stripe Price IDs (Required for billing)

After deploying, create your pricing plans in Stripe Dashboard:

1. Go to **Stripe → Products → Add Product**
2. Create 5 products matching your plans:

| Plan | Monthly Price | Annual Price |
|---|---|---|
| Starter | $449/mo | $4,488/yr |
| Professional | $749/mo | $7,488/yr |
| Enterprise | $1,499/mo | $14,988/yr |
| White-Label Growth | $2,499/mo | $24,988/yr |
| White-Label Agency | $4,999/mo | $49,988/yr |

3. Copy each **Price ID** (starts with `price_`)
4. Run this SQL in Supabase to update:

```sql
update public.plans set
  stripe_price_monthly = 'price_YOUR_STARTER_MONTHLY_ID',
  stripe_price_annual  = 'price_YOUR_STARTER_ANNUAL_ID'
where id = 'starter';

-- Repeat for: professional, enterprise, white_label_growth, white_label_agency
```

---

## Troubleshooting

**Build fails:** Run `npx tsc --noEmit` — fix any TypeScript errors first

**Webhook not firing:** Make sure the webhook URL is correct and events match exactly

**Email not sending:** Verify your domain in Resend dashboard. Check `EMAIL_FROM` matches your verified domain

**PDF generation fails on Vercel:** Add to `vercel.json` → set `maxDuration: 60` for PDF routes. Puppeteer runs in production using the bundled Chromium.

**Supabase RLS blocking queries:** All service-role operations bypass RLS. If a user query is blocked, check the RLS policy on that table.

---

## Support

- Email: support@saguarocrm.com
- Issues: Check `SAGUARO_COMPLETE_SETUP.sql` ran without errors
