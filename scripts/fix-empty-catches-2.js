/* Second batch of empty-catch fixes — the eight the first pass did not cover.
 *
 *   node scripts/fix-empty-catches-2.js [--apply]
 *
 * Same three treatments as scripts/fix-empty-catches.js: surfaced, logged, or
 * deliberately empty with a reason written down.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');

const EDITS = [
  // The client has already gone; sending or closing throws and there is nothing
  // left to tell anyone.
  ['app/api/ai/[...path]/route.ts',
    "          send(controller, { type: 'done', sessionId: 'error' });\n        } catch {}",
    "          send(controller, { type: 'done', sessionId: 'error' });\n        } catch { /* client disconnected before the error could be sent */ }",
    'intended'],

  ['app/api/ai/[...path]/route.ts',
    'try { controller.close(); } catch {}',
    'try { controller.close(); } catch { /* stream already closed */ }',
    'intended'],

  ['app/field/specs/page.tsx',
    "    localStorage.setItem('saguaro-spec-recent', JSON.stringify(recent.slice(0, 20)));\n  } catch {}",
    "    localStorage.setItem('saguaro-spec-recent', JSON.stringify(recent.slice(0, 20)));\n  } catch { /* localStorage unavailable (private mode / blocked cookies) */ }",
    'intended'],

  // The offline queue is itself the fallback. If queueing also fails the edit is
  // genuinely lost, so that must reach the console rather than disappear.
  ['app/field/budget/page.tsx',
    "      try { const { enqueue } = await import('@/lib/field-db'); await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false }); } catch {}",
    "      try { const { enqueue } = await import('@/lib/field-db'); await enqueue({ url, method: 'PATCH', body, contentType: 'application/json', isFormData: false }); }\n      catch (e) { console.error('[field/budget] offline queue failed — this edit is lost:', e); }",
    'logged'],

  ['app/app/projects/[projectId]/intelligence/page.tsx',
    "              ));\n            }\n          } catch {}",
    "              ));\n            }\n          } catch (e) {\n            // Keep whatever streamed through; the partial answer is still useful.\n            console.error('[intelligence] stream failed:', e);\n          }",
    'logged'],

  ['app/app/projects/[projectId]/pay-apps/new/page.tsx',
    "        if(p?.contract_amount) setContractSum(String(p.contract_amount));\n      }catch{}",
    "        if(p?.contract_amount) setContractSum(String(p.contract_amount));\n      } catch (e) {\n        // Prefill only — the field stays empty and the user can type it.\n        console.error('[pay-apps/new] contract prefill failed:', e);\n      }",
    'logged'],
];

let applied = 0;
const missed = [];
const byFile = {};
for (const [file, find, repl, kind] of EDITS) (byFile[file] ||= []).push([find, repl, kind]);

for (const [rel, edits] of Object.entries(byFile)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { missed.push(`${rel}  (file not found)`); continue; }
  let src = fs.readFileSync(abs, 'utf8');
  const EOL = src.includes('\r\n') ? '\r\n' : '\n';
  const nl = (t) => t.split('\n').join(EOL);
  let n = 0;

  for (const [find, repl, kind] of edits) {
    const f = nl(find);
    const count = src.split(f).length - 1;
    if (count === 0) { missed.push(`${rel}  [${kind}]  ${JSON.stringify(find.trim().slice(0, 56))}`); continue; }
    src = src.split(f).join(nl(repl));
    n += count;
  }

  if (n) {
    applied += n;
    if (APPLY) fs.writeFileSync(abs, src);
    console.log(`${String(n).padStart(2)}  ${rel}`);
  }
}

if (missed.length) {
  console.log('\ndid not match:');
  missed.forEach((m) => console.log('    ' + m));
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${applied} catch block(s)`);
if (!APPLY) console.log('re-run with --apply to write');
