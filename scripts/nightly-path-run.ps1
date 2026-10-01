# Saguaro — drive ONE must-pass path, live, unattended.
#
# WHY THIS RUNS LOCALLY AND NOT IN THE CLOUD
# A cloud routine gets a fresh GitHub checkout with no .env.local, so it cannot
# sign in and can never prove a path actually works — every answer comes back
# "code-verified, awaiting live run". This machine already has .env.local, so the
# live drive happens here and no secret is ever copied anywhere.
#
# WHAT IT DOES: picks the first path in docs/MUST-PASS.md that is not PASS,
# drives it against a real build as a signed-in user, writes PASS or FAIL with
# the actual output, logs anything off-path to docs/FOUND.md without fixing it,
# commits to a branch and pushes THAT BRANCH ONLY.
#
# Register it (one line, run once, as yourself):
#   schtasks /Create /TN "Saguaro nightly path" /SC DAILY /ST 02:10 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File D:\Saguaro-Live\scripts\nightly-path-run.ps1"
# Check it:   schtasks /Query /TN "Saguaro nightly path"
# Run it now: schtasks /Run /TN "Saguaro nightly path"
# Remove it:  schtasks /Delete /TN "Saguaro nightly path" /F

$ErrorActionPreference = 'Continue'
$repo = 'D:\Saguaro-Live'
$logDir = Join-Path $repo 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("path-run-" + (Get-Date -Format 'yyyy-MM-dd-HHmm') + ".log")

Set-Location $repo

"=== $(Get-Date -Format 'u') starting ===" | Out-File -FilePath $log -Encoding utf8

# Start from current origin/main so the run never builds on a stale tree.
# Any uncommitted local work is left alone: if the tree is dirty, stop rather
# than risk clobbering something Chad was mid-way through.
$dirty = (git status --porcelain) | Measure-Object -Line
if ($dirty.Lines -gt 0) {
  "ABORTED: working tree is dirty, $($dirty.Lines) file(s). Not touching it." | Out-File -FilePath $log -Append -Encoding utf8
  exit 0
}
# git writes progress to stderr; in PowerShell 5.1 redirecting a native command's
# stderr wraps every line in an ErrorRecord, so the log fills with NativeCommandError
# noise for a successful fetch. Capture the stream instead of redirecting it.
function Log-Git { param([string[]]$GitArgs)
  $out = & git @GitArgs 2>&1 | Out-String
  ("git " + ($GitArgs -join ' ') + " -> " + $out.Trim()) | Out-File -FilePath $log -Append -Encoding utf8
}
Log-Git @('fetch','origin','--quiet')
Log-Git @('checkout','main','--quiet')
Log-Git @('merge','--ff-only','origin/main')

# LOAD ANTHROPIC_API_KEY FROM .env.local.
# The key lives in .env.local beside the Supabase credentials -- it is NOT a
# Windows environment variable, which is why the first unattended run got
# "401 OAuth access token has expired": the headless CLI fell back to the
# standalone OAuth credential, last refreshed 16 Sep, because the desktop app
# keeps its own auth and never refreshes the CLI's.
# Read it into THIS process only. Never echoed, never logged, never committed.
$envFile = Join-Path $repo '.env.local'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$') {
      $env:ANTHROPIC_API_KEY = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if ($env:ANTHROPIC_API_KEY) {
  "ANTHROPIC_API_KEY loaded from .env.local (length $($env:ANTHROPIC_API_KEY.Length))" |
    Out-File -FilePath $log -Append -Encoding utf8
} else {
  "no ANTHROPIC_API_KEY in .env.local -- falling back to the CLI's OAuth credential" |
    Out-File -FilePath $log -Append -Encoding utf8
}

# AUTH PRE-FLIGHT. The first unattended run died here with
#   "API Error: 401 OAuth access token has expired. Re-authenticate to continue."
# and still exited 0, so Task Scheduler reported success while nothing happened.
# A nightly job that cannot tell you it did nothing is worse than no nightly job.
# One cheap round trip, and a distinctive marker plus a non-zero exit if it fails.
$authProbe = & claude -p 'Reply with exactly: AUTH OK' --dangerously-skip-permissions 2>&1 | Out-String
if ($authProbe -notmatch 'AUTH OK') {
  "AUTH PRE-FLIGHT FAILED -- no path was attempted. Claude said:" | Out-File -FilePath $log -Append -Encoding utf8
  $authProbe.Trim() | Out-File -FilePath $log -Append -Encoding utf8
  @'

FIX ONE OF THESE, THEN THIS RUNS ON ITS OWN:
  (a) run `claude` once in a terminal and sign in -- refreshes
      %USERPROFILE%\.claude\.credentials.json, which the desktop app does NOT
      keep fresh for the standalone CLI; or
  (b) set ANTHROPIC_API_KEY as a USER environment variable. Durable, but it is
      metered API usage billed separately from the Claude subscription.
'@ | Out-File -FilePath $log -Append -Encoding utf8
  exit 2
}
"auth pre-flight OK" | Out-File -FilePath $log -Append -Encoding utf8

$prompt = @'
Saguaro CRM. Read CLAUDE.md and obey section 0.

ONE PATH, THIS RUN. Never begin a second path.

1. Read docs/MUST-PASS.md. If it is missing, stop and say so — do not invent
   paths. Pick the FIRST path whose STATUS is not PASS. Name it immediately.

2. DRIVE IT LIVE. That is the whole point of running on this machine:
   .env.local is here, so you can actually sign in.
   - npm run build, then start the server with npm run start on port 3000.
   - CRITICAL: confirm the server you are testing is NEWER than the build.
     Compare the process start time against .next/BUILD_ID's mtime. A stale
     server has silently wasted a whole run before.
   - Sign in with SAGUARO_QA_EMAIL / SAGUARO_QA_PASS from .env.local via
     supabase-js, take the session cookie, and call the real endpoints the
     path uses as that signed-in user.
   - For each step record the actual response: status code and the fields that
     matter. Paste it. A step with no output is not a verified step.

3. Write PASS only for a step you actually drove and saw succeed. Anything you
   could not drive is FAIL or CANNOT VERIFY with the reason. Never fabricate a
   result, never seed data to make a check pass, and never write a script whose
   assertions cannot fail. If you create fixtures, label them clearly and delete
   them in a finally block, then prove the deletion.

4. Fix ONLY what blocks this path. Run npx tsc --noEmit after each file and
   npm run build once at the end; both clean.

5. Anything else you find goes in docs/FOUND.md as one line with file and line
   number, and you DO NOT FIX IT.

6. Update that path's STATUS in docs/MUST-PASS.md to PASS or FAIL with the date.
   Commit to a branch named path/<short-name> and push THAT BRANCH. Never commit
   to main, never push main, never force-push, never touch .env files.

7. Stop the server you started before you finish.

Final output, five lines: path name; PASS or FAIL; what you fixed; what could
not be verified and why; new line count in docs/FOUND.md.
'@

"--- prompt sent, invoking claude ---" | Out-File -FilePath $log -Append -Encoding utf8

# --dangerously-skip-permissions is required for an unattended run: there is
# nobody at the keyboard to approve each edit. It is bounded by the prompt above
# (branch only, never main, never .env) and every action lands in this log.
& claude -p $prompt --dangerously-skip-permissions 2>&1 |
  Out-File -FilePath $log -Append -Encoding utf8

"=== $(Get-Date -Format 'u') finished ===" | Out-File -FilePath $log -Append -Encoding utf8

# Leave the tree on main so the next run starts clean.
Log-Git @('checkout','main','--quiet')
