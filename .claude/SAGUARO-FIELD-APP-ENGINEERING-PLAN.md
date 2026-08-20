# SAGUARO FIELD APP — MASTER ENGINEERING PLAN
## Production Implementation Guide with Testing Strategy
### Version 1.0 | March 2026

---

## EXECUTIVE SUMMARY

This document defines the complete engineering plan for transforming the Saguaro Field App from a functional prototype into the most advanced construction field management platform in the industry. The plan covers 100+ features across 15 categories, organized into 8 implementation sprints with full testing strategies for each.

**Stack:** Next.js 14, TypeScript, Supabase (Postgres + Storage + Realtime + Auth), Tailwind CSS, Capacitor (iOS/Android), Vercel
**Project ID:** jddfvugsaosvgllbkzch
**Production URL:** saguarocontrol.net
**Working Directory:** Live-Code-Saguaro

---

## SPRINT 1 — DESIGN SYSTEM OVERHAUL (Week 1-2)
### Priority: CRITICAL — Highest visual impact, foundation for everything else

#### 1.1 Color System + Theme Tokens

**Files to create/modify:**
- `lib/design-tokens.ts` — centralized color, spacing, radius, shadow tokens
- `app/globals.css` — CSS custom properties for all tokens
- `components/ThemeProvider.tsx` — theme context with dark/light/auto detection

**Token Definitions:**
```
Background layers:
  --bg-base: #0F1419 (dark) / #F8FAFC (light)
  --bg-card: #1A1F2E (dark) / #FFFFFF (light)
  --bg-elevated: #232938 (dark) / #F1F5F9 (light)
  --bg-overlay: rgba(0,0,0,0.6) (dark) / rgba(0,0,0,0.3) (light)

Accent colors per module:
  --accent-financial: #D4A017 (gold)
  --accent-rfi: #3B82F6 (blue)
  --accent-safety: #EF4444 (red)
  --accent-schedule: #8B5CF6 (purple)
  --accent-photos: #06B6D4 (cyan)
  --accent-punch: #F97316 (orange)
  --accent-success: #22C55E (green)

Text hierarchy:
  --text-primary: rgba(255,255,255,0.92) / rgba(0,0,0,0.87)
  --text-secondary: rgba(255,255,255,0.55) / rgba(0,0,0,0.55)
  --text-tertiary: rgba(255,255,255,0.30) / rgba(0,0,0,0.30)

Shadows (glassmorphism):
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.05)
  --shadow-elevated: 0 8px 24px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.08)
  --shadow-fab: 0 4px 16px rgba(212,160,23,0.4)
```

**Testing:**
- Visual regression test: screenshot every page in dark + light mode
- Contrast ratio check: all text must pass WCAG AA (4.5:1 normal, 3:1 large)
- Theme toggle: verify localStorage persistence across sessions
- Auto-detection: test `prefers-color-scheme` media query response

---

#### 1.2 Custom SVG Icon System

**Files to create:**
- `components/icons/index.tsx` — barrel export of all icons
- `components/icons/*.tsx` — individual icon components (24px viewBox, 1.5px stroke)

**Icon set (minimum 40 icons):**
```
Navigation: home, punch, log, camera, grid, chevron-left, chevron-right, menu
Actions: plus, edit, trash, share, download, upload, search, filter, sort
Status: check-circle, x-circle, alert-triangle, clock, calendar
Documents: file-text, clipboard, folder, paperclip, printer
Field: hard-hat, wrench, thermometer, cloud-rain, sun, wind
Financial: dollar-sign, trending-up, trending-down, bar-chart, pie-chart
Communication: message-circle, phone, mic, volume, bell
Media: camera, image, video, maximize, minimize, rotate-cw
```

**Implementation:** Each icon is a React component accepting `size`, `color`, `strokeWidth` props. Default: size=24, color=currentColor, strokeWidth=1.5.

**Testing:**
- Render test: every icon renders without errors at sizes 16, 20, 24, 32
- Color prop: verify custom color application
- Accessibility: every icon used in buttons must have `aria-label`

---

#### 1.3 Glassmorphism Card Component

**Files to create/modify:**
- `components/ui/Card.tsx` — base card with variants
- `components/ui/BottomSheet.tsx` — slide-up modal
- `components/ui/FAB.tsx` — floating action button

**Card variants:**
```typescript
interface CardProps {
  variant: 'glass' | 'solid' | 'outline' | 'gradient';
  accent?: 'gold' | 'blue' | 'green' | 'red' | 'purple' | 'cyan';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean; // adds hover/active states
  children: React.ReactNode;
}
```

**Glass effect CSS:**
```css
.card-glass {
  background: rgba(26, 31, 46, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.card-glass:active {
  transform: scale(0.98);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
```

**Testing:**
- Render all 4 variants with all 6 accent colors
- Interactive: verify scale animation on tap
- Backdrop-filter: test in Safari (needs -webkit prefix)
- Overflow: verify content doesn't bleed outside rounded corners

---

#### 1.4 Animated Bottom Navigation

**Files to modify:**
- `app/field/layout.tsx` — replace current bottom nav

**Design spec:**
```
Height: 56px (64px on Android with safe area)
Background: var(--bg-card) with blur(20px)
Border-top: 1px solid rgba(255,255,255,0.06)
Icons: 24px, 1.5px stroke
Labels: 10px, font-weight 500
Active indicator: 32px wide pill, 3px tall, gold gradient, CSS transition 300ms
Active icon: filled variant, gold color
Inactive icon: outline variant, text-secondary color
```

**Animation:** Active indicator pill slides between tabs using CSS `transform: translateX()` with `transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)`.

**Testing:**
- Navigation: tap each tab, verify page loads + indicator slides
- Safe area: test with iPhone notch + Android gesture nav
- Rapid taps: verify no animation glitching
- Offline: verify navigation works without network

---

#### 1.5 Typography Scale

**Implementation in globals.css:**
```css
/* Large titles (page headers) */
.title-lg { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
.title-md { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
.title-sm { font-size: 15px; font-weight: 600; letter-spacing: 0; line-height: 1.4; }

/* Body text */
.body-lg { font-size: 15px; font-weight: 400; line-height: 1.5; }
.body-md { font-size: 13px; font-weight: 400; line-height: 1.5; }
.body-sm { font-size: 12px; font-weight: 400; line-height: 1.4; }

/* Labels */
.label-lg { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
.label-sm { font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }

/* Monospace (codes, numbers) */
.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
```

**Testing:**
- Readability: all text legible on iPhone SE (320px width)
- Truncation: long text uses ellipsis, never breaks layout
- Dynamic type: test with iOS accessibility text size changes

---

### SPRINT 1 TESTING CHECKLIST:
- [ ] All pages render without console errors
- [ ] Dark mode: every element visible and readable
- [ ] Light mode: every element visible and readable
- [ ] Theme persists across page navigation and app restart
- [ ] All icons render at all sizes without clipping
- [ ] Bottom nav indicator animates smoothly between all 5 tabs
- [ ] Cards respond to tap with scale animation
- [ ] Typography hierarchy is visually distinct at every level
- [ ] Glassmorphism blur renders on iOS Safari, Chrome, Firefox
- [ ] Page load time < 2 seconds on 3G connection
- [ ] Lighthouse accessibility score > 90
- [ ] No layout shift on initial page load (CLS < 0.1)

---

## SPRINT 2 — SMART DASHBOARD + AI BRIEFING (Week 3-4)
### Priority: HIGH — Demo wow factor, daily user engagement

#### 2.1 Onboarding Wizard

**Files to create:**
- `components/field/OnboardingWizard.tsx`

**Flow (3 steps):**
1. "Welcome to Saguaro Field" — name, role (Super/PM/Foreman/Owner), company
2. "Create your first project" — name, address, type, start date (pre-fills from CRM if available)
3. "Invite your team" — email invites with role assignment, skip option

**Database:**
- Reads/writes: `profiles`, `projects`, `project_team`
- Sets `user_preferences.onboarding_complete = true`

**Testing:**
- Complete flow: verify project created in Supabase
- Skip: verify all steps are skippable
- Existing user: wizard does not show if `onboarding_complete = true`
- Mobile: all form fields usable on 320px screen

---

#### 2.2 Weather Widget with Work-Impact

**Files to create:**
- `components/field/WeatherWidget.tsx`
- `lib/weather.ts` — API wrapper

**Data source:** Open-Meteo API (free, no key required)
**GPS:** Uses `lib/native.ts` → `getCurrentPosition()`

**Display:**
```
┌─────────────────────────────────────┐
│ ☀️ 87°F  Clear                      │
│ Wind: 12 mph SW  Humidity: 23%      │
│ ■■■■■■■■□□ Good conditions          │
│ Hourly: 85° 87° 89° 91° 88° 82°    │
└─────────────────────────────────────┘
```

**Work-impact logic:**
- GREEN (Good): temp 40-95°F, wind < 25 mph, no precip
- YELLOW (Caution): temp 95-105°F OR 32-40°F, wind 25-40 mph, light rain
- RED (Stop Work): temp > 105°F OR < 32°F, wind > 40 mph, lightning, heavy rain/snow

**Testing:**
- GPS denied: shows manual zip code input fallback
- API failure: shows "Weather unavailable" with retry button
- Extreme conditions: verify RED alert triggers correctly
- Hourly forecast: verify 6-hour lookahead renders
- Offline: cache last weather data in localStorage, show with "Last updated X min ago"

---

#### 2.3 Project Health Score Ring

**Files to create:**
- `components/field/HealthScoreRing.tsx`

**Score calculation (0-100):**
```
Budget health (25 points):
  - On budget: 25
  - 1-5% over: 20
  - 5-10% over: 10
  - > 10% over: 0

Schedule health (25 points):
  - On schedule: 25
  - 1-7 days behind: 20
  - 7-14 days behind: 10
  - > 14 days behind: 0

Open items (25 points):
  - 0 overdue RFIs + 0 overdue punch: 25
  - 1-3 overdue: 20
  - 4-10 overdue: 10
  - > 10 overdue: 0

Documentation (25 points):
  - Daily logs current: 10
  - Photos within 48 hrs: 8
  - Insurance certs valid: 7
```

**Visual:** SVG circle with animated stroke-dashoffset, color transitions from green (80-100) to yellow (50-79) to red (0-49).

**Data sources:**
- `budgets` — budget vs actual
- `schedule_phases` — planned vs actual dates
- `rfis` — open + overdue count
- `punch_list_items` — open + overdue count
- `daily_logs` — last entry date
- `photos` — last upload date
- `insurance_certificates` — expiration dates

**Testing:**
- Score 100: verify green ring, full circle
- Score 50: verify yellow ring, half circle
- Score 0: verify red ring, empty circle
- No data: shows "Set up project data to see health score"
- Animation: ring animates from 0 to current score on mount
- Real data: create test project with known values, verify score matches formula

---

#### 2.4 AI Daily Briefing Card

**Files to create:**
- `components/field/AIBriefing.tsx`
- `app/api/field/briefing/route.ts`

**API endpoint logic:**
1. Query all open items for active project: overdue RFIs, expiring insurance, pending approvals, open punch, upcoming deliveries, weather risks
2. Send to Claude with prompt: "You are a construction superintendent's AI assistant. Summarize these items into a 3-5 bullet briefing for starting the day. Be direct and actionable."
3. Cache result in `ai_briefings` table (1 per project per day)

**Display:**
```
┌─────────────────────────────────────┐
│ ☀ Good morning, Chad               │
│                                     │
│ • 3 RFIs need response today        │
│ • Concrete pour scheduled Thu —     │
│   weather looks clear               │
│ • ABC Electric insurance expires    │
│   in 12 days — send renewal notice  │
│ • 2 punch items overdue on Bldg A   │
│                                     │
│ [View All Items]  [Ask Sage →]      │
└─────────────────────────────────────┘
```

**Database table:**
```sql
CREATE TABLE ai_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content JSONB NOT NULL, -- { bullets: string[], raw_data: object }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id, briefing_date)
);
```

**Testing:**
- First load: generates briefing via AI, caches to DB
- Second load same day: serves from cache (no AI call)
- No project selected: shows "Select a project to see your daily briefing"
- AI failure: shows "Briefing unavailable" with manual data summary fallback
- Content accuracy: verify each bullet maps to real DB data
- Performance: briefing API returns < 3 seconds

---

#### 2.5 Recent Activity Feed

**Files to create:**
- `components/field/ActivityFeed.tsx`

**Data source:** `activity_log` table — already exists with all CRUD actions logged.

**Display:** Grouped by time (Today, Yesterday, This Week) with avatar, action description, timestamp.

**Testing:**
- Empty state: "No recent activity — start by creating a daily log"
- Pagination: load 20 items, scroll to load more
- Real-time: new activities appear without refresh (Supabase Realtime subscription)
- Tap item: navigates to the relevant page (RFI detail, punch item, etc.)

---

### SPRINT 2 TESTING CHECKLIST:
- [ ] Onboarding wizard creates real project in Supabase
- [ ] Weather widget shows real GPS-based forecast
- [ ] Weather work-impact colors match conditions correctly
- [ ] Health score ring animates and shows correct color
- [ ] Health score calculation matches formula with test data
- [ ] AI briefing generates on first load, caches on subsequent loads
- [ ] Activity feed shows real recent actions
- [ ] All widgets handle "no data" state gracefully
- [ ] Dashboard loads in < 2 seconds on production
- [ ] All data is real — zero placeholders, zero mocks

---

## SPRINT 3 — PHOTO EXPERIENCE UPGRADE (Week 5-6)
### Priority: HIGH — Most-used feature in field apps

#### 3.1 Full-Screen Photo Viewer

**Files to create:**
- `components/field/PhotoViewer.tsx`

**Features:**
- Pinch-to-zoom using CSS `transform: scale()` + touch event handling
- Swipe left/right to navigate between photos
- Double-tap to zoom to 2x
- Metadata overlay: date, location, phase, caption
- Action bar: share, annotate, delete, download, tag

**Testing:**
- Zoom: pinch gesture zooms in/out smoothly
- Swipe: navigates to next/previous photo
- Boundaries: zoom cannot exceed 5x or go below 1x
- Performance: loads 50+ photo gallery without lag
- Memory: large photos (5MB+) don't crash the app

---

#### 3.2 Photo Markup Tools

**Files to modify:**
- `components/PhotoEditor.tsx` — already exists, enhance

**Tools to add:**
```
Drawing: freehand pen with color picker + width slider
Arrows: tap start + end point, arrow renders between
Text: tap to place, type label, drag to reposition
Shapes: rectangle, circle, line with color + fill options
Measure: draw a line, enter real-world dimension, shows as annotation
Stamps: checkmark, X, question mark, safety hazard
Undo/redo: stack-based history (max 50 operations)
```

**Save mechanism:** Canvas renders annotations → exports as new image → uploads to Supabase Storage alongside original (never overwrites original).

**Testing:**
- Draw: freehand line renders smoothly on touch
- Arrow: renders with arrowhead pointing correct direction
- Text: text input appears, accepts keyboard input, repositions on drag
- Undo: each operation is reversible
- Save: annotated image appears in gallery alongside original
- Original preserved: original photo is never modified

---

#### 3.3 Photo Comparison Slider

**Files to create:**
- `components/field/PhotoCompare.tsx`

**UX:** Two photos side by side with a draggable vertical divider. User drags left/right to reveal more of each photo. Used for before/after construction progress documentation.

**Testing:**
- Drag: divider moves smoothly with touch
- Boundaries: divider cannot go past edges
- Different sizes: handles photos with different aspect ratios
- Mobile: works on both portrait and landscape orientation

---

#### 3.4 Batch Operations

**Files to modify:**
- `app/field/photos/page.tsx`

**Features:**
- Long-press to enter selection mode
- Tap to select/deselect individual photos
- "Select All" button in header
- Batch actions: tag, download, share, delete
- Selection count badge in header

**Testing:**
- Select 10 photos, apply tag, verify all 10 updated in Supabase
- Select 5 photos, delete, verify removed from storage + DB
- Cancel selection: all checkmarks clear
- Performance: selecting/deselecting 50 photos is instant

---

### SPRINT 3 TESTING CHECKLIST:
- [ ] Photo viewer opens full-screen with pinch-to-zoom
- [ ] Swipe navigation works between photos
- [ ] All 8 markup tools function correctly
- [ ] Undo/redo works for all operations
- [ ] Annotated photos save to Supabase Storage
- [ ] Original photos are never modified
- [ ] Photo comparison slider drags smoothly
- [ ] Batch select/tag/delete operates on real DB data
- [ ] Photo upload from camera with GPS tagging works
- [ ] Offline: photos queue for upload, sync when reconnected
- [ ] Memory: app doesn't crash with 100+ photos loaded

---

## SPRINT 4 — VOICE + COMMUNICATION (Week 7-8)
### Priority: HIGH — Superintendent killer feature

#### 4.1 Voice Memos on Any Item

**Files to create:**
- `components/field/VoiceMemo.tsx`
- `app/api/voice/transcribe/route.ts`

**Flow:**
1. User taps mic icon on any item (RFI, punch, daily log, photo)
2. MediaRecorder captures audio (WebM/OGG format)
3. Audio uploads to Supabase Storage: `{project_id}/voice-memos/{item_type}/{item_id}/{timestamp}.webm`
4. Server sends audio to OpenAI Whisper API for transcription
5. Transcription text returned and saved to the item's notes field
6. Both audio URL + transcription stored in DB

**Database:**
```sql
CREATE TABLE voice_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  item_type TEXT NOT NULL, -- 'rfi', 'punch', 'daily_log', 'photo', 'general'
  item_id UUID,
  audio_url TEXT NOT NULL,
  transcription TEXT,
  duration_seconds INTEGER,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Testing:**
- Record: audio captures for 5, 15, 60 seconds without issues
- Playback: recorded audio plays back correctly
- Transcription: English speech transcribed with > 90% accuracy
- Attachment: voice memo appears on the associated item
- Offline: audio recorded and queued for transcription when reconnected
- Size: 60-second memo is < 1MB

---

#### 4.2 Voice Command via Sage

**Files to modify:**
- `components/field/VoiceToLog.tsx` — already exists, enhance
- `app/api/sage/voice-command/route.ts` — new endpoint

**Commands:**
```
"Log 4 electricians on-site today"
  → Creates daily_log_crew entry: trade=Electrical, headcount=4

"Create RFI for missing fire caulking at stairwell B"
  → Creates RFI with title + description auto-populated

"Add punch item: drywall damage room 204"
  → Creates punch_list_item with title + location

"What's the weather today?"
  → Returns current conditions + work-impact assessment

"How many open punch items?"
  → Queries DB, returns count with breakdown by trade
```

**Implementation:**
1. Speech-to-text via Web Speech API (already implemented)
2. Send transcribed text to Claude with construction-context system prompt
3. Claude returns structured JSON: `{ action: 'create_crew_entry', data: { trade: 'Electrical', headcount: 4 } }`
4. Frontend executes the action via existing API routes

**Testing:**
- Each command type: verify correct DB record created
- Ambiguous input: "log some guys today" → asks for clarification
- Error handling: unrecognized command → "I didn't understand that. Try 'log 4 electricians on-site'"
- Noise: test with background construction noise (simulate with audio)

---

#### 4.3 Push-to-Talk Messaging

**Files to create:**
- `components/field/WalkieTalkie.tsx`
- `app/api/messages/voice/route.ts`

**Implementation:**
- Uses Supabase Realtime channels for presence + message delivery
- Audio recorded as short clips (max 30 seconds)
- Clips uploaded to Storage, URL broadcast via Realtime channel
- Recipients get push notification + audio auto-plays

**Testing:**
- Two users: send voice message, verify received in < 3 seconds
- Offline recipient: message queued, delivered on reconnect
- Audio quality: clear at construction site noise levels
- Max duration: recording stops at 30 seconds with warning

---

#### 4.4 Auto Daily Summary Email

**Files to create:**
- `app/api/cron/daily-summary/route.ts`
- `lib/email-templates/daily-summary.ts`

**Trigger:** Vercel Cron job at 5:00 PM local time daily

**Content:** AI-generated summary from:
- Daily logs submitted today
- Photos uploaded today
- RFIs created/responded
- Punch items created/completed
- Crew count + hours
- Weather conditions
- Any issues/delays noted

**Recipients:** Project owner + PM (configurable in project settings)

**Testing:**
- Cron fires: verify email sent via Supabase Edge Function or Resend
- Content: verify summary includes real data from test project
- No activity: email says "No field activity logged today — consider checking in with your superintendent"
- Unsubscribe: user can opt out in notification preferences

---

### SPRINT 4 TESTING CHECKLIST:
- [ ] Voice memo records, uploads, and transcribes correctly
- [ ] Voice memos attach to RFIs, punch items, daily logs, photos
- [ ] Voice commands create correct DB records
- [ ] Push-to-talk delivers audio in < 3 seconds
- [ ] Daily summary email contains real project data
- [ ] All voice features work offline (queue for sync)
- [ ] Whisper transcription accuracy > 90% for construction terms
- [ ] Audio files are < 1MB per 60 seconds

---

## SPRINT 5 — LOCATION INTELLIGENCE + GEOFENCING (Week 9-10)
### Priority: MEDIUM — High value but requires GPS infrastructure

#### 5.1 Geofence Auto-Clock

**Database:**
```sql
ALTER TABLE projects ADD COLUMN geofence_center POINT;
ALTER TABLE projects ADD COLUMN geofence_radius_meters INTEGER DEFAULT 200;

CREATE TABLE geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'enter' | 'exit'
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Implementation:**
- Capacitor Geolocation plugin for background location updates
- Calculate distance from project center using Haversine formula
- Enter geofence: auto-clock-in, show notification "Clocked in at {project}"
- Exit geofence: show notification "Did you leave {project}?" with confirm/dismiss
- Manual override always available

**Testing:**
- Enter: simulate GPS coordinates inside geofence boundary, verify auto-clock
- Exit: simulate GPS coordinates outside boundary, verify prompt
- Accuracy: verify works with GPS accuracy 10m, 50m, 100m
- Multiple projects: handles overlapping geofences correctly
- Battery: background location does not drain battery excessively (< 5%/hr)
- Privacy: geofence data only shared with project admins, not other workers

---

#### 5.2 Site Map with Crew Locations

**Files to create:**
- `components/field/SiteMap.tsx`
- `app/api/field/crew-locations/route.ts`

**Implementation:**
- Mapbox or Google Maps embed showing project site
- Worker pins with name, trade, last-updated timestamp
- Color-coded by trade: blue=electrical, red=plumbing, green=framing, etc.
- Refresh every 30 seconds via Supabase Realtime

**Testing:**
- 10 workers: all pins render without overlap issues
- Stale data: pins older than 15 minutes show "inactive" gray state
- Privacy toggle: workers can disable location sharing in their profile
- Map loads: < 2 seconds on mobile connection

---

#### 5.3 Auto-Project Detection

**Files to modify:**
- `app/field/layout.tsx`
- `lib/hooks/useActiveProject.ts`

**Logic:**
1. On app open, get current GPS coordinates
2. Query all projects where distance to geofence_center < geofence_radius
3. If exactly 1 match: auto-select that project, show toast "You're at {project}"
4. If multiple matches: show picker "Which project are you at?"
5. If no match: show full project list

**Testing:**
- Single match: auto-selects project without user action
- Multiple matches: shows disambiguation picker
- No match: shows standard project list
- GPS denied: falls back to manual selection with no error

---

### SPRINT 5 TESTING CHECKLIST:
- [ ] Geofence enter triggers auto-clock-in
- [ ] Geofence exit shows confirmation prompt
- [ ] Site map renders with real crew locations
- [ ] Auto-project detection selects correct project
- [ ] Background location does not excessively drain battery
- [ ] Privacy controls work (disable sharing, admin-only viewing)
- [ ] All GPS features degrade gracefully when GPS is unavailable

---

## SPRINT 6 — PREDICTIVE AI ENGINE (Week 11-12)
### Priority: MEDIUM — Competitive differentiator

#### 6.1 Schedule Risk Predictor

**Files to create:**
- `app/api/ai/schedule-risk/route.ts`
- `components/field/ScheduleRisk.tsx`

**Logic:**
1. Query `schedule_phases` for all active phases
2. Calculate actual pace: (% complete) / (days elapsed)
3. Project completion: remaining work / current pace
4. If projected completion > planned completion: flag risk
5. Send to Claude: "Given these schedule metrics, identify the top 3 risks and suggest mitigations"

**Testing:**
- On-schedule project: shows "On track" with green indicator
- Behind schedule: shows specific phase names + days behind
- AI suggestions: verify they reference real project data
- No schedule data: shows "Add schedule phases to enable risk prediction"

---

#### 6.2 Cost Overrun Early Warning

**Files to create:**
- `app/api/ai/cost-warning/route.ts`

**Logic:**
1. Compare budget burn rate: (actual_cost / budget) vs (days_elapsed / total_days)
2. If spending pace > schedule pace by > 10%: flag warning
3. Analyze by CSI division: identify which trades are overspending
4. Historical comparison: compare current project burn to similar completed projects

**Testing:**
- Normal spending: no warning
- 15% overspend pace: warning with specific divisions identified
- No budget data: shows "Create a budget to enable cost monitoring"

---

#### 6.3 Subcontractor Reliability Score

**Files to modify:**
- Enhance existing `subcontractor_scores` table and API

**Score factors (0-100):**
```
On-time completion (30 points):
  - Schedule phases completed on/before due date

Change order frequency (20 points):
  - Fewer COs relative to contract value = higher score

Insurance compliance (20 points):
  - Certs always current and on file

Lien waiver timeliness (15 points):
  - Waivers submitted within 5 days of payment

Punch list closure (15 points):
  - Punch items closed within SLA
```

**Display:** Badge on subcontractor profile with score + breakdown chart

**Testing:**
- Perfect sub: score = 100, green badge
- Problematic sub: score < 50, red badge with specific issues flagged
- New sub (no history): shows "New — no performance data yet"
- Score updates: recalculates when new data is added (CO, payment, etc.)

---

### SPRINT 6 TESTING CHECKLIST:
- [ ] Schedule risk predictor identifies correct at-risk phases
- [ ] Cost warning fires when spending pace exceeds schedule pace
- [ ] Sub reliability score matches formula with test data
- [ ] All AI features use real project data, never mock data
- [ ] Predictions include actionable recommendations
- [ ] Features handle "no data" states gracefully

---

## SPRINT 7 — FORMS ENGINE + COMPLIANCE (Week 13-14)
### Priority: MEDIUM — Revenue differentiator (enterprise feature)

#### 7.1 Custom Form Builder

**Database:**
```sql
CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'safety', 'quality', 'inspection', 'checklist', 'custom'
  fields JSONB NOT NULL, -- array of field definitions
  created_by UUID NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID REFERENCES form_templates(id),
  project_id UUID NOT NULL,
  submitted_by UUID NOT NULL,
  data JSONB NOT NULL, -- field values
  photos TEXT[], -- array of storage URLs
  signature_url TEXT,
  status TEXT DEFAULT 'submitted', -- 'draft', 'submitted', 'reviewed', 'approved'
  location POINT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Field types supported:**
```
text, textarea, number, date, time, datetime,
select (single), multiselect, checkbox, radio,
photo (capture + gallery), signature,
location (auto GPS), rating (1-5 stars),
section_header, divider,
conditional (if field X = Y, show this field)
```

**Testing:**
- Create template: verify saved to DB with correct field structure
- Fill form: verify all field types capture data correctly
- Conditional logic: verify fields show/hide based on conditions
- Photo field: captures and uploads to Supabase Storage
- Signature field: captures and saves signature image
- Offline: form data queued for submission when reconnected
- PDF export: completed form generates formatted PDF

---

#### 7.2 OSHA Toolbox Talk Generator

**Files to create:**
- `app/api/ai/toolbox-talk/route.ts`
- `components/field/ToolboxTalk.tsx`

**Logic:**
1. Query current project: active trades, work activities, recent safety incidents
2. Send to Claude: "Generate a 5-minute toolbox talk topic relevant to {trades} performing {activities}. Include: topic title, 3-5 key talking points, 2 discussion questions, reminder of relevant OSHA standard."
3. Save generated talk to `safety_talks` table
4. Attendance tracking: workers sign in via digital signature

**Testing:**
- Generate: produces relevant safety topic for active trades
- Attendance: digital signatures saved to DB
- PDF: generates printable attendance sheet with signatures
- History: previous talks viewable with attendance records

---

#### 7.3 Insurance Auto-Verification

**Files to modify:**
- `app/api/compliance/verify-insurance/route.ts`

**Logic:**
1. When insurance cert uploaded, OCR extract: carrier, policy number, effective/expiry dates, coverage amounts
2. Compare against project requirements (GL minimum, WC minimum, auto minimum, umbrella)
3. Auto-flag gaps: "GL coverage $1M but project requires $2M"
4. Auto-schedule reminders: 90, 60, 30 days before expiry
5. Dashboard shows compliance status per sub with red/yellow/green indicators

**Testing:**
- Upload valid cert: all fields extracted correctly, status = compliant
- Upload insufficient coverage: specific gap identified
- Expiring cert: reminders scheduled at correct intervals
- Expired cert: red flag on sub profile + notification to PM

---

### SPRINT 7 TESTING CHECKLIST:
- [ ] Form builder creates templates with all field types
- [ ] Form submission captures all data to Supabase
- [ ] Conditional logic shows/hides fields correctly
- [ ] Photo and signature fields capture and upload correctly
- [ ] Toolbox talk generates relevant content
- [ ] Attendance tracking with digital signatures works
- [ ] Insurance OCR extracts key fields accurately
- [ ] Compliance dashboard shows correct status per sub
- [ ] All forms work offline with sync on reconnect

---

## SPRINT 8 — GAMIFICATION + INTEGRATIONS + POLISH (Week 15-16)
### Priority: LOW-MEDIUM — Differentiation + enterprise readiness

#### 8.1 Gamification System

**Database:**
```sql
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  project_id UUID,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB -- specific metrics that earned the badge
);

CREATE TABLE leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID,
  category TEXT NOT NULL, -- 'safety_streak', 'punch_closure', 'photo_docs', 'on_time'
  entity_type TEXT NOT NULL, -- 'user', 'subcontractor', 'project'
  entity_id UUID NOT NULL,
  score NUMERIC DEFAULT 0,
  period TEXT, -- 'weekly', 'monthly', 'all_time'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Badges:**
- Safety Star: 30 days without incident
- Photo Pro: 100+ photos uploaded on a project
- Quick Closer: punch items closed within 24 hours
- Documentation Hero: daily logs submitted every work day for a month
- On-Time Champion: all deliverables submitted before deadline

**Confetti animation:** Uses canvas-confetti library, triggered on milestone completion.

**Testing:**
- Badge earned: notification + badge appears on profile
- Leaderboard: correct ranking based on real performance data
- Confetti: renders on milestone without performance issues
- No gaming: verify badges require genuine activity, not artificial inflation

---

#### 8.2 Integration Webhooks

**Files to create:**
- `app/api/webhooks/outbound/route.ts`
- `app/api/integrations/zapier/route.ts`

**Events that trigger webhooks:**
```
project.created, project.updated
rfi.created, rfi.responded, rfi.closed
change_order.created, change_order.approved
pay_app.submitted, pay_app.approved
punch.created, punch.completed
daily_log.submitted
photo.uploaded
insurance.expiring, insurance.expired
```

**Payload format:**
```json
{
  "event": "rfi.created",
  "timestamp": "2026-03-28T12:00:00Z",
  "project_id": "uuid",
  "data": { /* full RFI object */ },
  "tenant_id": "uuid"
}
```

**Testing:**
- Each event type: verify webhook fires with correct payload
- Retry: failed webhooks retry 3 times with exponential backoff
- Zapier: create test Zap, verify data flows through
- Security: webhooks include HMAC signature for verification

---

#### 8.3 Final Polish

**Animations:**
- Page transitions: 200ms opacity + translateY(8px) fade-in
- List items: stagger entrance animation (50ms delay per item, max 10)
- Skeleton loading: shimmer gradient animation on all loading states
- Button press: 150ms scale(0.97) on touch, spring back on release
- Success states: check icon draws itself (SVG stroke-dasharray animation)
- Delete: item slides left and fades out (300ms)

**Empty states (every page):**
- Custom illustration (simple SVG) + descriptive title + CTA button
- Examples: "No punch items — tap + to create your first one"
- "No photos yet — tap the camera to start documenting"

**Error states:**
- Network error: "You're offline — we'll sync when you're back"
- API error: "Something went wrong — tap to retry"
- 404: "This item was moved or deleted"

**Testing:**
- Every page: verify loading skeleton appears before data
- Every page: verify empty state shows when no data
- Every animation: runs at 60fps on iPhone 12 (mid-range device)
- Every error state: shows appropriate message with retry action

---

### SPRINT 8 TESTING CHECKLIST:
- [ ] Badges earned for genuine activity
- [ ] Leaderboard rankings match real performance data
- [ ] Confetti animation renders without performance issues
- [ ] Webhooks fire for all defined events
- [ ] Zapier integration receives and processes events
- [ ] Page transitions animate smoothly at 60fps
- [ ] Every page has a loading skeleton
- [ ] Every page has a contextual empty state
- [ ] Every error shows an appropriate message with retry
- [ ] All animations run at 60fps on mid-range devices

---

## PRODUCTION TESTING PROTOCOL

### Pre-Deploy Checklist (every sprint):
1. `npx next build` — zero errors, zero TypeScript failures
2. Lighthouse audit: Performance > 80, Accessibility > 90, Best Practices > 90
3. All Supabase tables have RLS policies enabled
4. All API routes return proper error codes (400, 401, 403, 404, 500)
5. All forms submit real data to Supabase (verified via SQL query)
6. Offline mode: test with Chrome DevTools network throttle set to "Offline"
7. Mobile: test on iPhone SE (smallest screen) + iPad (tablet layout)
8. Cross-browser: Chrome, Safari, Firefox on mobile

### Post-Deploy Verification:
1. Visit saguarocontrol.net/field — verify all pages load
2. Create test project — verify saved to Supabase
3. Upload photo — verify saved to Supabase Storage
4. Submit daily log — verify saved to DB
5. Create punch item — verify saved to DB
6. Check Vercel Function Logs — zero runtime errors
7. Test on actual phone (not just desktop browser)

### Performance Benchmarks:
- Time to Interactive: < 3 seconds on 4G
- First Contentful Paint: < 1.5 seconds
- Largest Contentful Paint: < 2.5 seconds
- Cumulative Layout Shift: < 0.1
- Total Bundle Size: < 500KB gzipped
- API Response Times: < 500ms for reads, < 2s for writes
- AI Endpoints: < 5s for analysis, < 3s for briefings

### Security Checklist:
- All API routes require authentication (getUser check)
- No secrets in client-side code
- CORS configured for production domain only
- Rate limiting on all AI endpoints (30/min) and auth endpoints (10/min)
- File uploads validated for type + size before processing
- SQL injection prevented by Supabase parameterized queries
- XSS prevented by React's default escaping + explicit sanitization

---

## TIMELINE SUMMARY

| Sprint | Focus | Duration | Features |
|--------|-------|----------|----------|
| 1 | Design System | Week 1-2 | Icons, cards, nav, theme, typography |
| 2 | Smart Dashboard | Week 3-4 | Weather, health score, AI briefing, activity feed |
| 3 | Photo Experience | Week 5-6 | Viewer, markup, comparison, batch ops |
| 4 | Voice + Communication | Week 7-8 | Voice memos, commands, push-to-talk, daily summary |
| 5 | Location Intelligence | Week 9-10 | Geofence, site map, auto-detect |
| 6 | Predictive AI | Week 11-12 | Schedule risk, cost warning, sub scoring |
| 7 | Forms + Compliance | Week 13-14 | Form builder, toolbox talks, insurance verification |
| 8 | Gamification + Polish | Week 15-16 | Badges, webhooks, animations, empty states |

**Total: 16 weeks to complete competitive destruction.**

Each sprint is independently deployable — users see improvements every 2 weeks.

---

## DEPENDENCIES + INFRASTRUCTURE

**NPM packages to add:**
- `canvas-confetti` — celebration animations
- `@capacitor/geolocation` — already installed
- `@capacitor/haptics` — already installed
- `mapbox-gl` or `@react-google-maps/api` — site maps
- `framer-motion` — page transitions + animations

**Supabase additions:**
- 4 new tables (form_templates, form_submissions, voice_memos, ai_briefings, geofence_events, badges, leaderboards)
- 1 new storage bucket (voice-memos)
- 2 Realtime channels (crew-locations, push-to-talk)
- 1 Edge Function (daily summary email cron)

**External APIs:**
- Open-Meteo (weather) — free, no key
- OpenAI Whisper (transcription) — ~$0.006/min
- Anthropic Claude (AI features) — already configured
- Mapbox (maps) — free tier 50K loads/month

**Vercel configuration:**
- Cron job: daily summary at 5 PM
- Function timeout: 300s for AI endpoints (already set)
- Edge config: rate limiting values

---

*Document generated: March 28, 2026*
*Author: Claude Opus 4.6 + Chad Derocher*
*Project: Saguaro CRM — Field App Enhancement*
