# Saguaro CRM — Replit Handoff Package

This package reorganizes the uploaded Saguaro CRM handoff into a **clean Replit-ready Next.js App Router repo**.

It includes:
- the uploaded Autopilot engine migrated into the root `app/` + `lib/` structure
- a fully wired **Bid Invite + Subcontractor Portal** slice
- placeholder routes for the rest of the documented CRM tree so Replit gets a stable, organized project structure immediately

## What is fully wired right now

### Bid invite + subcontractor portal
- create bid packages
- add bid package items
- generate subcontractor invite links
- invite-token portal login with signed cookie session
- draft/save/submit bid line items
- upload bid documents into Supabase Storage
- internal award action

### Autopilot engine
- root-level migration
- root-level engine
- root-level cron route
- root-level CLI script

## Replit boot steps
1. Create a Node.js Repl or import this folder into Replit.
2. Add the environment variables from `.env.example`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Run the SQL files inside `supabase/migrations/` in order.
6. Create the Supabase Storage bucket `project-files`.
7. Open `/setup` and then the tenant routes.

## Important note
This handoff only included the Autopilot files plus the repo manifests, not the full original app source. The remaining modules are scaffolded into the documented structure so the repo is organized and can be handed to Replit immediately.
