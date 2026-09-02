#!/usr/bin/env node
/**
 * test-help-routes — does a step know which screen it belongs on?
 *
 * The first implementation was `pathname.startsWith(step.route)`, which is
 * wrong for one reason that breaks everything: "/app" is a prefix of every
 * route in the product. A step pinned to the dashboard read as on-route on
 * /app/projects/new, so rather than offering to take you to the dashboard it
 * searched that page for a control that was never on it and reported "I can't
 * find that control on this screen". Every step of the first-day walkthrough
 * failed exactly that way, on every page.
 *
 * The rule mirrors lib/help-tours routeMatches:
 *
 *   '/app'            exactly the dashboard
 *   '/app/projects'   exactly the project list
 *   '/app/projects/'  anywhere inside a project
 *
 * Keep this in step with that function.
 */

function routeMatches(route, pathname) {
  if (!route) return true;
  const here = (pathname || '').replace(/\/+$/, '') || '/';
  if (route.endsWith('/')) {
    const base = route.replace(/\/+$/, '');
    return here !== base && here.startsWith(base + '/');
  }
  return here === route;
}

/* [route, pathname, expected] */
const CASES = [
  // The bug that started this: /app must not match everything under it.
  ['/app', '/app', true],
  ['/app', '/app/projects', false],
  ['/app', '/app/projects/new', false],
  ['/app', '/app/takeoff', false],
  ['/app', '/app/projects/abc-123/budget', false],

  // The project list is not a project.
  ['/app/projects', '/app/projects', true],
  ['/app/projects', '/app/projects/', true],
  ['/app/projects', '/app/projects/new', false],
  ['/app/projects', '/app/projects/abc-123', false],
  ['/app/projects', '/app/projects/abc-123/pay-apps', false],

  // Inside a project — the only case that wants the trailing slash.
  ['/app/projects/', '/app/projects', false],
  ['/app/projects/', '/app/projects/abc-123', true],
  ['/app/projects/', '/app/projects/abc-123/budget', true],
  ['/app/projects/', '/app/projects/abc-123/pay-apps/new', true],
  ['/app/projects/', '/app/takeoff', false],
  ['/app/projects/', '/app', false],

  // Plain module pages.
  ['/app/projects/new', '/app/projects/new', true],
  ['/app/projects/new', '/app/projects', false],
  ['/app/takeoff', '/app/takeoff', true],
  ['/app/takeoff', '/app/takeoff/measured', false],
  ['/app/takeoff', '/app/takeoff/rates', false],
  ['/app/daily-logs', '/app/daily-logs', true],
  ['/app/daily-logs', '/app/daily-logs/abc-123', false],

  // A near-miss that must not match: /app/people vs /app/peoples.
  ['/app/people', '/app/peoples', false],
  ['/app/bids', '/app/bids/leveling', false],

  // No route at all — the step works anywhere.
  [undefined, '/app/anything/at/all', true],

  // Trailing slashes on the pathname are noise.
  ['/app/takeoff', '/app/takeoff/', true],
  ['/app', '/app/', true],
];

let failures = [];
for (const [route, pathname, expected] of CASES) {
  const got = routeMatches(route, pathname);
  if (got !== expected) {
    failures.push(`route ${JSON.stringify(route)} vs ${pathname}\n      expected ${expected}, got ${got}`);
  }
}

console.log('='.repeat(70));
console.log('HELP MODE — does a step know which screen it belongs on?');
console.log('='.repeat(70));
console.log(`  cases     ${CASES.length}`);
console.log(`  FAILURES  ${failures.length}`);
if (failures.length) {
  console.log('');
  failures.forEach((f) => console.log(`  ${f}`));
}
process.exitCode = failures.length ? 1 : 0;
