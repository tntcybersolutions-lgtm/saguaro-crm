# Saguaro CRM - Production Deployment Guide

## Overview

This guide walks you through deploying Saguaro CRM Phase 1 to a production hosting provider. The application is built with Next.js and requires Node.js 18+ and a Supabase database.

**Estimated deployment time**: 30-45 minutes

---

## Pre-Deployment Checklist

### Prerequisites
- [ ] Node.js 18+ installed locally
- [ ] Next.js project initialized with all Phase 1 files
- [ ] Supabase account and project created (free tier OK for testing)
- [ ] QuickBooks developer app created (for QB integration)
- [ ] Hosting provider account (Vercel, Netlify, custom VPS, AWS, etc.)
- [ ] Domain name purchased
- [ ] SSL certificate (auto-provided by most hosts)

### Code Requirements
- [ ] All .ts/.tsx files compile without errors (`npm run build`)
- [ ] `.env.local` created with all required variables
- [ ] Database migrations applied to Supabase
- [ ] `project-photos` storage bucket created in Supabase
- [ ] Git repository initialized (recommended)

---

## Step 1: Local Verification (5 minutes)

### 1.1 Install Dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

### 1.2 Verify TypeScript Compilation
```bash
npm run type-check
# Should output: "✓ No type errors found"
# or: "Compiled successfully without errors"
```

### 1.3 Verify Build Process
```bash
npm run build
# Should complete with: "next build" output showing
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Collecting page static props // (next/image optimization)
# Export successful. Exported to .next folder
```

### 1.4 Test Development Server
```bash
npm run dev
# Open http://localhost:3000
# Verify page loads without errors in console
```

---

## Step 2: Environment Setup (10 minutes)

### 2.1 Prepare Environment Variables

Create `.env.local` (copy from `.env.example` and fill in your values):

```bash
cp .env.example .env.local
```

**Critical variables to set:**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=https://yourdomain.com/api/integrations/quickbooks/callback

# Node environment
NODE_ENV=production
```

### 2.2 Verify Environment Setup
```bash
# Test that all required env vars are defined
node -e "
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('❌ Missing environment variables:', missing);
  process.exit(1);
} else {
  console.log('✓ All required environment variables are set');
}
"
```

---

## Step 3: Database Preparation (5 minutes)

### 3.1 Connect to Supabase

1. Open [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to SQL Editor
4. Click "New query"

### 3.2 Apply Database Migration

Open `supabase/migrations/003_add_feature_tables.sql` and copy the entire SQL content, then paste it into Supabase SQL Editor.

**Steps:**
1. Paste migration SQL
2. Click "Run" button
3. Verify no error messages appear
4. Check that all tables created:
   - sync_log
   - report_templates
   - alert_configs
   - alert_logs
   - project_photos
   - time_entries
   - cost_entries

### 3.3 Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Click "New bucket"
3. Name: `project-photos`
4. Make public: ✓ (check the box)
5. Click "Create bucket"

### 3.4 Verify Database Connection

Test from command line:
```bash
npm run verify-db
# Or run this one-liner:
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
client.from('projects').select('count(*)').then(
  r => console.log('✓ DB connected'),
  e => console.error('❌ DB error:', e.message)
);
"
```

---

## Step 4: Build for Production (5 minutes)

### 4.1 Create Production Build

```bash
npm run build

# Output should show:
# ✓ Compiled successfully
# ✓ Collecting page static props
# Route (pages)
```

### 4.2 Verify Build Output

```bash
# Check that .next folder was created
ls -la .next/

# Should contain:
# - static/ (optimized JS/CSS)
# - public/ (assets)
# - server/ (API routes)
```

### 4.3 Test Production Build Locally

```bash
npm run start
# Opens server on http://localhost:3000
# Test a few pages to ensure they load
```

---

## Step 5: Choose Your Hosting Provider

### Option A: Vercel (Recommended - Easiest)

**Pros**: Zero-config, auto-scaling, free tier available, Next.js native
**Cons**: Higher costs at scale

**Steps:**

1. Sign up at [https://vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Select your GitHub repository (or import manually)
4. Configure project:
   - Framework: Next.js (auto-detected)
   - Build command: `npm run build`
   - Output directory: `.next`
5. Add environment variables:
   - Go to "Settings" → "Environment Variables"
   - Paste all variables from `.env.local` (excluding `NODE_ENV`)
6. Click "Deploy"
7. Wait 2-3 minutes for deployment
8. Vercel provides you a domain: `https://your-project.vercel.app`

**Post-Deploy:**
1. Update `QUICKBOOKS_REDIRECT_URI` to Vercel URL
2. Re-deploy to apply new redirect URI

---

### Option B: Netlify

**Pros**: Easy Git integration, good free tier, Jamstack focus
**Cons**: Requires build optimizations for API routes

**Steps:**

1. Sign up at [https://netlify.com](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub
4. Configure:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Functions directory: (leave blank, Next.js handles)
5. Add environment variables in Site Settings → Build & deploy → Environment
6. Deploy

---

### Option C: AWS (EC2 + RDS)

**Pros**: Highly customizable, scales well, cost-predictable
**Cons**: More setup required

**Prerequisites:**
- AWS account
- SSH key pair created
- Security group configured (ports 80, 443, 22)

**Steps:**

1. **Launch EC2 Instance**
   ```bash
   # Choose Ubuntu 22.04 LTS
   # Instance type: t3.small minimum (for testing/small projects)
   # Storage: 30GB EBS gp3
   ```

2. **Connect to Server**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs npm
   node --version  # Should be v20.x
   ```

4. **Install PM2 (Process Manager)**
   ```bash
   sudo npm install -g pm2
   ```

5. **Install Nginx (Reverse Proxy)**
   ```bash
   sudo apt-get install -y nginx
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

6. **Clone Repository**
   ```bash
   cd /var/www
   git clone https://github.com/yourusername/saguaro-crm.git
   cd saguaro-crm
   npm install
   npm run build
   ```

7. **Configure PM2**
   ```bash
   pm2 start "npm run start" --name "saguaro"
   pm2 startup
   pm2 save
   ```

8. **Configure Nginx**
   ```bash
   sudo nano /etc/nginx/sites-available/default
   ```
   
   Replace with:
   ```nginx
   server {
     listen 80 default_server;
     listen [::]:80 default_server;
     
     server_name _;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   
   ```bash
   sudo systemctl restart nginx
   ```

9. **Install SSL (Let's Encrypt)**
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

### Option D: Custom VPS (DigitalOcean, Linode, etc.)

**Similar to AWS EC2 steps above:**

1. Create Droplet (Ubuntu 22.04)
2. SSH in
3. Install Node.js + Nginx + PM2
4. Clone repo, build, start server
5. Configure DNS to point to VPS IP
6. Install SSL certificate

---

## Step 6: Post-Deployment Configuration (5 minutes)

### 6.1 Update QB Redirect URI

Your Saguaro app is now live at your domain. Update QuickBooks OAuth:

1. Go to [https://developer.intuit.com](https://developer.intuit.com)
2. Select your app → Settings
3. Find "Redirect URIs"
4. Add: `https://yourdomain.com/api/integrations/quickbooks/callback`
5. Save

**Test QB OAuth:**
1. Navigate to dashboard
2. Click "Connect QuickBooks"
3. Should redirect to QB auth page
4. After auth, should redirect back to your app

### 6.2 Configure Alert Webhooks

If using Slack/Teams alerts:

**Slack:**
1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your app → Incoming Webhooks
3. Create webhook for your channel
4. Copy URL
5. In Saguaro: Projects → Alert Config → Add Integration → Slack
6. Paste webhook URL
7. Test: Create overdue RFI, should see alert in Slack

**Teams:**
1. Go to your Teams channel
2. Click "..." → Connectors → Incoming Webhook
3. Create new webhook
4. Copy URL
5. In Saguaro: Projects → Alert Config → Add Integration → Teams
6. Paste webhook URL

### 6.3 Test All Phase 1 Features

**Offline Sync:**
1. Open DevTools → Network
2. Set throttling to "Offline"
3. Create new invoice
4. Should show "Offline - 1 pending"
5. Go back online
6. Should see sync notification

**QB Integration:**
1. Go to project settings
2. Click "Connect QuickBooks"
3. Authorize with QB credentials
4. Verify invoices sync from QB

**Reports:**
1. Go to Reports
2. Select "Invoices" entity
3. Add filter (status = pending)
4. Click "Generate Report"
5. Export to CSV
6. Verify data in CSV

**Photos:**
1. Go to project RFIs
2. Click RFI detail
3. Upload photo
4. GPS should be tagged (if location allowed)
5. Verify in photo gallery

---

## Step 7: Domain & SSL Setup (5 minutes)

### 7.1 Point Domain to Hosting

**If using Vercel/Netlify:**
1. Note the provided domain: `your-project.vercel.app`
2. Go to domain registrar (GoDaddy, Namecheap, etc.)
3. Update DNS records:
   - Type: CNAME
   - Name: @ (root)
   - Value: cname.vercel.app (varies by host)
4. Wait 15-30 minutes for DNS propagation

**If using custom VPS:**
1. Get your VPS IP address
2. Go to domain registrar
3. Update A record:
   - Type: A
   - Name: @ (root)
   - Value: your-vps-ip
4. Wait for propagation

### 7.2 Verify SSL Certificate

```bash
# Should show valid certificate
openssl s_client -connect yourdomain.com:443

# Or test in browser - no red warning
curl -I https://yourdomain.com
```

---

## Step 8: Monitoring & Verification (10 minutes)

### 8.1 Health Check Endpoint

Add to your API routes:
```typescript
// src/app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date() });
}
```

Test:
```bash
curl https://yourdomain.com/api/health
# Should return: {"status":"ok","timestamp":"2026-03-08T..."}
```

### 8.2 Monitor Server Logs

**Vercel:**
- Dashboard → Deployments → View Logs

**Netlify:**
- Dashboard → Production deploys → View logs

**Custom VPS:**
```bash
# SSH into server
pm2 logs saguaro
# Or
tail -f /var/log/nginx/access.log
```

### 8.3 Error Tracking

Set up Sentry (free tier available):

```typescript
// Add to your app
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### 8.4 Performance Monitoring

```bash
# Test page load speed
npm run lighthouse

# Or use Google PageSpeed Insights
# https://pagespeed.web.dev/?url=yourdomain.com
```

---

## Step 9: Backup & Disaster Recovery (5 minutes)

### 9.1 Configure Supabase Backups

1. Go to Supabase dashboard
2. Project → Settings → Backups
3. Enable automatic backups (recommended: daily)
4. Choose retention period (30 days minimum)

### 9.2 Backup Storage bucket

```bash
# Download project photos periodically
gsutil -m cp -r gs://your-supabase-storage/* ./backups/

# Or use Supabase CLI
supabase db pull
supabase storage download
```

### 9.3 Document Disaster Recovery Plan

1. **Database Loss**: Restore from Supabase backup
2. **Storage Loss**: Restore from local backups
3. **Code Loss**: Restore from Git (push to repo)
4. **Complete Outage**: Redeploy to new server

---

## Troubleshooting

### Build Fails with Type Errors

```bash
npm run type-check
# Fix errors in TypeScript files
npm run build
```

### Environment Variables Not Working

```bash
# Verify they're set in your hosting provider
echo $NEXT_PUBLIC_SUPABASE_URL

# For Next.js: NEXT_PUBLIC_* variables are embedded in client code
# They must be set BEFORE build, not after
```

### QB OAuth Loop

```
Problem: Redirects back to QB auth infinitely
Solution:
1. Verify QUICKBOOKS_REDIRECT_URI exactly matches QB app settings
2. No trailing slashes
3. Matches domain exactly (http vs https, www vs no-www)
```

### Storage Upload Fails

```
Problem: "Permission denied" when uploading photos
Solution:
1. Verify project-photos bucket exists
2. Verify bucket is public
3. Check Supabase RLS policies allow uploads
4. Verify authenticated user has INSERT permission
```

### Performance Issues

```bash
# Analyze bundle size
npm run analyze
# Should show what's taking up space

# Optimize:
1. Enable image optimization (next.config.js)
2. Remove unused dependencies
3. Enable caching headers
4. Use CDN for static assets
```

---

## Production Checklist

- [ ] `.env.local` has all production values (not dev values)
- [ ] Database migrations run successfully
- [ ] Storage bucket created and public
- [ ] QB app OAuth redirect URI points to production domain
- [ ] `npm run build` succeeds without errors
- [ ] `npm run type-check` shows zero type errors
- [ ] SSL certificate valid for your domain
- [ ] DNS records point correctly
- [ ] Health endpoint returns 200
- [ ] At least one smoke test passes (create/view invoice)
- [ ] Backups configured
- [ ] Error tracking enabled
- [ ] Team has access to Supabase dashboard
- [ ] Team has access to hosting provider dashboard
- [ ] Security headers set in next.config.js
- [ ] Rate limiting configured (if needed)
- [ ] Database indexes created for performance
- [ ] No console errors in browser DevTools
- [ ] Offline sync works (test with DevTools offline)
- [ ] QB integration works (test oauth flow)
- [ ] Reports export to CSV
- [ ] Photos upload and display
- [ ] Alerts send to Slack/Teams

---

## Maintenance

### Regular Tasks

**Weekly:**
- Review server logs for errors
- Check storage usage
- Monitor database performance

**Monthly:**
- Review security logs
- Check for library updates: `npm outdated`
- Backup database manually
- Test disaster recovery plan

**Quarterly:**
- Security audit
- Performance optimization review
- Plan Phase 2 features

---

## Success!

Your Saguaro CRM Phase 1 is now live on production! 🎉

**Next steps:**
1. Train your team
2. Begin Phase 2 (Slack bot + photo OCR)
3. Gather user feedback
4. Monitor performance

**Support:**
- Check PHASE_1_INTEGRATION.md for API docs
- Check PHASE_1_CHEATSHEET.md for quick reference
- Review error logs in Supabase/Vercel/Netlify
- Reach out to your hosting provider support

---

## Emergency Contacts

Create this file: `.deployment-contacts.md` (NOT in git)

```
CEO/Project Owner: [name, phone, email]
Tech Lead: [name, phone, email]
Hosting Support: [provider support link]
Database Support: [Supabase support]
Domain Registrar Support: [registrar support]
```

