# Saguaro CRM — Stripe Setup Guide

## PRICING
- Silver: $399/month | $3,990/year
- Gold: $499/month | $4,990/year
- Platinum: $799/month | $7,998/year

## STEP 1: Create Products in Stripe Dashboard
Go to: https://dashboard.stripe.com/products

Create Product: "Saguaro Silver"
- Add price: $399.00 / month (recurring) -> copy price_... ID
- Add price: $3,990.00 / year (recurring) -> copy price_... ID

Create Product: "Saguaro Gold"
- Add price: $499.00 / month (recurring) -> copy price_... ID
- Add price: $4,990.00 / year (recurring) -> copy price_... ID

Create Product: "Saguaro Platinum"
- Add price: $799.00 / month (recurring) -> copy price_... ID
- Add price: $7,998.00 / year (recurring) -> copy price_... ID

## STEP 2: Update Supabase plans table
Run this SQL in Supabase (replace price_xxx with real IDs from Step 1):

```sql
UPDATE plans SET
  stripe_price_id_monthly = 'price_SILVER_MONTHLY_ID',
  stripe_price_id_annual  = 'price_SILVER_ANNUAL_ID'
WHERE id = 'silver';

UPDATE plans SET
  stripe_price_id_monthly = 'price_GOLD_MONTHLY_ID',
  stripe_price_id_annual  = 'price_GOLD_ANNUAL_ID'
WHERE id = 'gold';

UPDATE plans SET
  stripe_price_id_monthly = 'price_PLATINUM_MONTHLY_ID',
  stripe_price_id_annual  = 'price_PLATINUM_ANNUAL_ID'
WHERE id = 'platinum';
```

## STEP 3: Create Stripe Webhook
Go to: https://dashboard.stripe.com/webhooks
Endpoint URL: https://saguarocontrol.net/api/stripe/webhook
Events to listen for:
- checkout.session.completed
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed

Copy the webhook signing secret (whsec_...)

## STEP 4: Add Environment Variables

In .env.local AND in Vercel Dashboard -> Settings -> Environment Variables:

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## STEP 5: Redeploy on Vercel
After setting env vars in Vercel: trigger a new deployment.

## STEP 6: Test with Stripe Test Mode
Use test card: 4242 4242 4242 4242, any future date, any CVC
1. Sign up for a new account at saguarocontrol.net
2. Let the trial expire (or manually set trial_ends_at to past in DB)
3. You should be redirected to /upgrade
4. Click "Start with Silver" -> should show $399/month
5. Complete checkout with test card
6. Verify: subscription row appears in Supabase subscriptions table
7. Verify: tenant.plan updated to 'silver'
8. Verify: you can access the app dashboard

## STEP 7: Switch to Live Mode
Replace sk_test_... keys with sk_live_... keys in Vercel env vars.
Redeploy. You're live.
