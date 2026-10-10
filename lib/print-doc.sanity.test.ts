/* Sanity checks for lib/print-doc — the parts that need no browser. */
import { withPrintTokens, docFileName } from './print-doc';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  → ${String(got)}`}`);
  if (!ok) failed++;
};

const withHead = withPrintTokens('<!doctype html><html><head><title>T</title></head><body style="color:var(--c-text)">x</body></html>');
check('tokens go inside <head>, before the title', /<head><style>:root\{--c-text:#F0F4FF;/.test(withHead) && withHead.indexOf('<style>') < withHead.indexOf('<title>'), withHead.slice(0, 80));
check('every token the printed pages use has a value', ['--c-text', '--success', '--danger', '--warning', '--brand-primary', '--brand-primary-strong', '--surface-card'].every((t) => withHead.includes(`${t}:`)));
const noHead = withPrintTokens('<html><body>x</body></html>');
check('no <head>: tokens go in front', noHead.startsWith('<style>:root{'), noHead.slice(0, 40));
check('a head with attributes still gets them', /<head lang="en"><style>/.test(withPrintTokens('<html><head lang="en"><title>a</title></head></html>')));
check('file name keeps words, drops slashes', docFileName('Application 3 — Pima / ADC') === 'Application 3 — Pima ADC.html', docFileName('Application 3 — Pima / ADC'));
check('empty title still names the file', docFileName('  ') === 'Saguaro document.html', docFileName('  '));
check('long title is cut to 80 characters', docFileName('x'.repeat(200)).length === 85);

if (failed) { console.error(`\n${failed} print-doc assertion(s) failed`); process.exit(1); }
console.log('\nall print-doc assertions held');
