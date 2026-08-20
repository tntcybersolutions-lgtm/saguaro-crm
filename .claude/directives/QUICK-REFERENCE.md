# QUICK REFERENCE -- PASTE INTO ANY SESSION

```
STANDING ORDERS (apply to all sessions):

STACK: Next.js 14 App Router, TypeScript strict, Supabase, Vercel
DIR: C:\Users\ChadDerocher\OneDrive - TNT Cyber Solutions\Documents\GitHub\Live-Code-Saguaro
SUPABASE: jddfvugsaosvgllbkzch (us-east-1)
THEME: Dark only. BG=#0d1117 CARD=#161b22 BORDER=#30363d GOLD=#C8960F TEXT=#F0F4FF DIM=#8BAAC8

AUTH PATTERN (every API route):
  import { createServerClient, getUser } from '@/lib/supabase-server';
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createServerClient();
  db.from('table').select('*').eq('tenant_id', user.tenantId)

FIELD PAGE TOKENS:
  import { F } from '@/lib/field-tokens';
  F.dark F.raised F.card F.border F.text F.dim F.gold F.green F.red F.blue F.amber

NEXT.JS 14 GOTCHAS:
  Dynamic params are async: const { id } = await params;
  useSearchParams() requires Suspense wrapper
  Supabase builder .catch() doesn't compile -- use .then(() => {}, () => {})

VERIFICATION LOOP (after every file):
  npx tsc --noEmit 2>&1 | head -5
  npm run build 2>&1 | grep -E "Compiled|error" | head -3

ZERO TOLERANCE:
  TS errors | Coming Soon | White backgrounds | Empty catches
  Missing auth | Missing tenant_id | Dead hrefs | Hardcoded UUIDs

PROOF FORMAT: raw terminal output, not prose.
DO NOT STOP until Definition of Done is checked with proof.
```
