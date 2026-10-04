# Handoff — Saguaro Field iOS → TestFlight / App Store (for Claude Desktop)

Written 2026-10-03 by the local Claude Code session. Everything on the code
side is done and proven on a simulator. What's left is Apple-account work,
which is yours.

## 1. State right now (verified, not assumed)

| Item | Status | Proof |
|---|---|---|
| Repo | `tntcybersolutions-lgtm/saguaro-crm`, branch `main` | PR #37, #38 merged |
| Bundle ID | `net.saguarocontrol.field` — the EXISTING TestFlight app "Saguaro Field" (it ran the retired React Native build from `D:/Saguaro-Field`, last build 35). This shell ships as its next build, so installed phones update in place. | `ios/App/App.xcodeproj/project.pbxproj`, guarded by `tools/check-ios-mirror.mjs` |
| Display name | Saguaro Field | `ios/App/App/Info.plist` |
| Version / build | `MARKETING_VERSION 2.0`, build = 1000 + CI run number (above the React Native builds) | `.github/workflows/ios.yml` |
| Min iOS | 14.0 (the Face ID plugin requires it) | Podfile + pbxproj |
| Devices | iPhone + iPad (`TARGETED_DEVICE_FAMILY 1,2`) | pbxproj |
| Start URL | `https://www.saguarocontrol.net/app` (server mode, loads the live site) | `capacitor.config.ts` |
| Stays in app | `allowNavigation: www.saguarocontrol.net, saguarocontrol.net` | `capacitor.config.ts` |
| Icon | Saguaro cactus, 1024 px, no alpha | `ios/App/App/Assets.xcassets/AppIcon.appiconset` |
| Splash | jet black + Saguaro logo, auto-hides after 2 s | `Splash.imageset`, `LaunchScreen.storyboard` |
| Permission strings | Camera, Photos, Photo add, Location, Microphone, **Face ID** | `Info.plist` |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` (HTTPS only) | `Info.plist` |
| Plugins | 16 (camera, geolocation, biometric, push, barcode, …) | `npx cap sync ios` output |
| Simulator proof | builds, installs, splash → sign-in screen inside the app, header clear of the clock | GitHub Actions run **37089951004** → artifact `ios-simulator-screenshots` |

There is no Mac. The build runs on GitHub-hosted macOS (`macos-14`) through
`.github/workflows/ios.yml`. You don't need a Mac either.

## 2. The CI workflow (already in `main`)

`.github/workflows/ios.yml` has two jobs:

- **`build`**: runs on every PR/push that touches the iOS shell, and on
  manual dispatch. It runs `npm ci`, then `npx cap sync ios` (which runs
  `pod install`), then an unsigned simulator build. It then boots an iPhone
  simulator, installs and launches the app, and uploads screenshots.
- **`testflight`**: manual only. Go to Actions → "iOS (Saguaro Field)" → Run
  workflow, tick **testflight**, and run on `main`. It imports the
  certificate and profile, archives Release, exports an App Store IPA, and
  uploads it with `xcrun altool`. It skips itself cleanly if any secret is
  missing.

## 3. Your job — Apple side, in order

### 3a. developer.apple.com → Certificates, Identifiers & Profiles
1. **Identifier**: App ID `net.saguarocontrol.field` already exists (the
   current TestFlight app). Nothing to create.
   Face ID and Camera need no capability.
2. **Certificate**: create an **Apple Distribution** certificate (or reuse
   the team's). Export it as `.p12` with a password.
3. **Profile**: create an **App Store Connect** distribution provisioning
   profile for `net.saguarocontrol.field` using that certificate (or reuse
   the existing one). Download the `.mobileprovision`.
4. Note the **Team ID** (Membership page, 10 characters).

### 3b. appstoreconnect.apple.com
1. **No new app record.** "Saguaro Field" (`net.saguarocontrol.field`)
   already exists; this build uploads to it as version 2.0.
2. **Users and Access → Integrations → App Store Connect API → +**: create a
   key with role **App Manager**. Download the `.p8` (you only get it once).
   Note the **Key ID** and **Issuer ID**.

### 3c. Load the 7 repo secrets
Run from any shell with `gh` authenticated to the repo. Values come from
files or hidden prompts and never appear on screen:

```bash
R=tntcybersolutions-lgtm/saguaro-crm
gh secret set IOS_DIST_CERT_P12_BASE64 -R $R -b "$(base64 -w0 distribution.p12)"   # macOS: base64 -i distribution.p12
gh secret set IOS_DIST_CERT_PASSWORD   -R $R            # prompts
gh secret set IOS_PROFILE_BASE64       -R $R -b "$(base64 -w0 SaguaroField_AppStore.mobileprovision)"
gh secret set APPLE_TEAM_ID            -R $R            # prompts
gh secret set ASC_KEY_ID               -R $R            # prompts
gh secret set ASC_ISSUER_ID            -R $R            # prompts
gh secret set ASC_KEY_P8_BASE64        -R $R -b "$(base64 -w0 AuthKey_XXXXXXXXXX.p8)"
gh secret list -R $R   # expect all 7 names
```

### 3d. Ship to TestFlight
```bash
gh workflow run ios.yml -R tntcybersolutions-lgtm/saguaro-crm --ref main -f testflight=true
gh run watch -R tntcybersolutions-lgtm/saguaro-crm $(gh run list -R tntcybersolutions-lgtm/saguaro-crm --workflow ios.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
When it's done, the build appears in App Store Connect → TestFlight after
processing (about 5–30 minutes). Add internal testers there.

### 3e. App Store submission (App Store Connect UI)
- **Privacy Policy URL**: `https://www.saguarocontrol.net/privacy`
- **Support URL**: `https://www.saguarocontrol.net/contact`
- **Category**: Business (secondary: Productivity)
- **App Privacy** (data collected, linked to the user): contact info
  (email, name), location (precise, for GPS-stamped clock-in and photos),
  photos, user content, identifiers. Not used for tracking.
- **Review sign-in**: Apple requires a working demo account. Create a
  dedicated reviewer user in Saguaro, not a real person's login, and put it
  in App Review Information.
- **Screenshots**: 6.7" and 6.5" iPhone, plus 12.9" iPad (iPad is
  supported). The CI simulator screenshots are a starting point; signed-in
  screens look better.
- **Guideline 4.2 (minimal functionality) risk**: the app loads the website.
  Point out the native features in the review notes: camera capture, GPS
  stamping, Face ID sign-in, push notifications and barcode scanning.
- **Guideline 3.1.1**: the sign-in screen has "Start Free Trial" links to
  web signup with paid plans. If review flags it, hide the signup and pricing
  links when `window.Capacitor?.isNativePlatform()` is true. That's a
  one-line web change — ask the code session.

## 4. Known gaps you may hit (code side — hand back, don't patch)

- **Push notifications**: there is no `App.entitlements` with
  `aps-environment` yet, and `AppDelegate.swift` doesn't forward the APNs
  token. Push won't deliver until both are added and the App ID has Push
  enabled. Ship TestFlight without it if needed; ask the code session to add
  the entitlement plus AppDelegate hooks once the profile includes Push.
- **Versioning**: the build number is 1000 + the CI run number (above the retired React Native builds on the same app). Bump
  `MARKETING_VERSION` in the pbxproj for each App Store version.
- The `testflight` job has never run, because no secrets existed. If the
  archive step fails on signing, the usual cause is a profile/certificate
  mismatch or a profile name with odd characters. The job reads the profile
  name from the `.mobileprovision`.

## 5. Report back
When TestFlight has the build, tell Chad:
1. the run ID,
2. the TestFlight build number,
3. whether it installs and signs in on a real iPhone.
