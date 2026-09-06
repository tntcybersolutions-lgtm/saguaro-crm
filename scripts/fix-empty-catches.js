/* Replaces every empty catch block with something that actually happens.
 *
 *   node scripts/fix-empty-catches.js [--apply]
 *
 * `catch {}` means the user clicks a button, the request fails, and the app
 * says nothing — the click just appears to do nothing. CLAUDE.md section 5
 * calls these bugs, not tech debt.
 *
 * Three treatments, chosen per site rather than applied blindly:
 *
 *   surfaced  a real user action failed and the page already has setError —
 *             tell them, and log the cause
 *   logged    a background or best-effort step failed; nothing to show the
 *             user, but it must not vanish from the console
 *   intended  there is genuinely nothing to do (a closed stream, localStorage
 *             blocked in private mode) — keep it empty but say why, so the next
 *             reader does not have to work it out
 *
 * Edits are exact-string and EOL-aware; anything that does not match is
 * reported rather than skipped silently.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');

// [file, find, replace, kind]
const EDITS = [
  // ── intended: nothing to do ────────────────────────────────────────────────
  ['app/api/ai/[...path]/route.ts',
    '} catch {}\n  };',
    '} catch { /* client disconnected — the stream is already closed */ }\n  };', 'intended'],

  ['app/field/specs/page.tsx',
    "try { localStorage.setItem('saguaro-spec-bookmarks', JSON.stringify(ids)); } catch {}",
    "try { localStorage.setItem('saguaro-spec-bookmarks', JSON.stringify(ids)); }\n  catch { /* localStorage unavailable (private mode / blocked cookies) */ }", 'intended'],

  ['app/layout.tsx',
    "navigator.serviceWorker.register('/sw.js').catch(function() {});",
    "navigator.serviceWorker.register('/sw.js').catch(function () {\n                /* registration is best-effort; the app works without it */\n              });", 'intended'],

  // ── surfaced: the user pressed something and it failed ─────────────────────
  ['app/app/invoicing/page.tsx',
    "      await fetch(`/api/invoices/${deleteConfirm}/delete`, { method: 'DELETE' });\n      await fetchInvoices();\n    } catch {}",
    "      await fetch(`/api/invoices/${deleteConfirm}/delete`, { method: 'DELETE' });\n      await fetchInvoices();\n    } catch (e) {\n      console.error('[invoicing] delete failed:', e);\n      setError('Could not delete that invoice. Please try again.');\n    }", 'surfaced'],

  ['app/app/invoicing/page.tsx',
    "      await fetch(`/api/invoices/${id}/send`, { method: 'POST' });\n      await fetchInvoices();\n    } catch {}",
    "      await fetch(`/api/invoices/${id}/send`, { method: 'POST' });\n      await fetchInvoices();\n    } catch (e) {\n      console.error('[invoicing] send failed:', e);\n      setError('Could not send that invoice. Please try again.');\n    }", 'surfaced'],

  ['app/app/roles-permissions/page.tsx',
    "        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim(), color: formColor, permissions: formPerms }) }); } catch {}",
    "        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim(), color: formColor, permissions: formPerms }) }); }\n    catch (e) { console.error('[roles] update failed:', e); setError('Role saved locally but the server rejected the change.'); }", 'surfaced'],

  ['app/app/roles-permissions/page.tsx',
    "        body: JSON.stringify(role) }); } catch {}",
    "        body: JSON.stringify(role) }); }\n    catch (e) { console.error('[roles] create failed:', e); setError('Role created locally but the server rejected it.'); }", 'surfaced'],

  ['app/app/roles-permissions/page.tsx',
    "    try { await fetch(`/api/roles/${id}`, { method: 'DELETE' }); } catch {}",
    "    try { await fetch(`/api/roles/${id}`, { method: 'DELETE' }); }\n    catch (e) { console.error('[roles] delete failed:', e); setError('Role removed locally but the server rejected it.'); }", 'surfaced'],

  ['app/app/roles-permissions/page.tsx',
    "      body: JSON.stringify(newAssign) }); } catch {}",
    "      body: JSON.stringify(newAssign) }); }\n    catch (e) { console.error('[roles] assign failed:', e); setError('Assignment saved locally but the server rejected it.'); }", 'surfaced'],

  ['app/app/roles-permissions/page.tsx',
    "    try { await fetch(`/api/roles/assignments/${id}`, { method: 'DELETE' }); } catch {}",
    "    try { await fetch(`/api/roles/assignments/${id}`, { method: 'DELETE' }); }\n    catch (e) { console.error('[roles] unassign failed:', e); setError('Assignment removed locally but the server rejected it.'); }", 'surfaced'],

  ['app/onboarding/step-2/page.tsx',
    "      body: JSON.stringify(form),\n      });\n    } catch {}",
    "      body: JSON.stringify(form),\n      });\n    } catch (e) {\n      console.error('[onboarding step-2] save failed:', e);\n      setError('We could not save that. Your answers are kept — please try again.');\n    }", 'surfaced'],

  ['app/onboarding/step-3/page.tsx',
    "      });\n      await res.json();\n    } catch {}",
    "      });\n      await res.json();\n    } catch (e) {\n      console.error('[onboarding step-3] save failed:', e);\n      setError('We could not save that. Your answers are kept — please try again.');\n    }", 'surfaced'],

  // ── logged: background work, nothing to show ───────────────────────────────
  ['app/app/layout.tsx',
    "              setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch {}",
    "              setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch (e) {\n            // Keep whatever streamed through — a partial answer is still useful.\n            console.error('[sage chat] stream failed:', e);\n          }", 'logged'],

  ['app/app/layout-LT-DeRocher2024.tsx',
    "              setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch {}",
    "              setAiMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch (e) {\n            console.error('[sage chat] stream failed:', e);\n          }", 'logged'],

  ['components/PortalSageChat.tsx',
    "              setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch {}",
    "              setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }]);\n            }\n          } catch (e) {\n            console.error('[portal sage] stream failed:', e);\n          }", 'logged'],
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
