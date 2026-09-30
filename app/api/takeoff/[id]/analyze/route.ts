import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import {
  processBlueprint,
  getPdfPageCount,
  extractPdfPages,
  disciplineFromSheetNumber,
  normalizeDiscipline,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCOPE,
  DISCIPLINE_PRIORITY,
  type Discipline,
} from '@/lib/blueprint-processor';
import { costKeyForCsiLine } from '@/lib/takeoff';
import { learnTenantRates } from '@/lib/takeoff-learn';
import { hasFeature } from '@/lib/entitlements-server';
import { must, tryWrite } from '@/lib/db-write';
import { logActivity, money } from '@/lib/activity';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Config: honest, realistic ceilings ───────────────────────────────────────
// The old path silently trimmed every plan set to the first 8 PAGES and read page 1
// natively. These bounds instead read a real multi-sheet set discipline-by-discipline
// and SAY SO when a set is bigger than we can fully analyze inside the 300s window.
const MODEL = 'claude-sonnet-4-6';
const MB = 1024 * 1024;
const SINGLE_PASS_MAX_PAGES = 5;   // ≤ this → one combined pass (fast path, common case)
/* A 25-sheet set is an ordinary commercial job, not an edge case, and these
   ceilings were quietly truncating every one of them: the index pass never saw
   sheet 25, so those sheets were not even listed, and the deep passes stopped
   at 24 regardless of how much of the 300s window was left.
   DEEP_BUDGET_MS below is the real governor — it stops the run on wall-clock
   and marks the remainder as honestly skipped — so the page counts do not need
   to double as a time limit. Raised, and env-tunable so a set that needs more
   can have it without a deploy. */
/* These were low because everything competed for one request and one sequential
   clock. Neither is true now: the index is cut into pieces that each fit, and
   the discipline passes run at once — a 28-sheet set went from 4.1 minutes to
   83 seconds when they stopped queueing. So the ceilings move up to where the
   wall-clock budget actually binds, not where the old request size did. */
const INDEX_MAX_PAGES       = Number(process.env.TAKEOFF_INDEX_MAX_PAGES   || 250);
const PER_DISCIPLINE_PAGES  = Number(process.env.TAKEOFF_PAGES_PER_PASS    || 12);
const MAX_ANALYZE_PAGES     = Number(process.env.TAKEOFF_MAX_ANALYZE_PAGES || 96);
const MAX_DEEP_PASSES       = Number(process.env.TAKEOFF_MAX_DEEP_PASSES || 8); // discipline passes, now concurrent
const DEEP_BUDGET_MS        = 210_000; // wall-clock budget for deep passes (route maxDuration=300s)
/* What Anthropic will accept for one request, and what we allow ourselves.
   This used to be a 28MB ceiling measured on the RAW buffer — but the PDF goes
   up base64-encoded, which is 4 bytes out for every 3 in. A 28MB sub-PDF
   therefore left here as ~37MB and came back 413 request_too_large, which is
   exactly what a GC saw uploading a 25-sheet set. The limit has to be measured
   on what actually crosses the wire. */
const ANTHROPIC_REQUEST_MAX = 32 * MB;
const PROMPT_HEADROOM       = 6 * MB;   // system prompt, sheet register, JSON scaffolding
const DOC_ENCODED_MAX       = ANTHROPIC_REQUEST_MAX - PROMPT_HEADROOM;

/** Exact base64 length for n bytes — 4 characters per 3 bytes, padded. */
const encodedSize = (bytes: number) => Math.ceil(bytes / 3) * 4;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff'];

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM =
  'Return ONLY raw JSON. No markdown. No backticks. No explanation. Start with { end with }.';

// ─── Combined single-pass prompt (small sets / images) ────────────────────────
const COMBINED_PROMPT = `You are a senior construction estimator with 25+ years of field experience.
Analyze this blueprint and produce a COMPLETE material takeoff — every item visible in the drawings.

WHAT TO EXTRACT:
- Read all dimension callouts (lengths, widths, heights, areas, depths)
- Calculate quantities from those dimensions: SF, LF, CY, SY, EA, LB, TON, etc.
- Count all components: doors, windows, fixtures, equipment, structural members
- Identify ALL trades: sitework, concrete, masonry, steel, framing, roofing, insulation, drywall, flooring, painting, MEP, specialties
- Use the drawing scale if shown; otherwise estimate proportionally
- Include every material needed to build this job from ground to finish
- Put actual dimensions from the drawings in the description field

Return ONLY raw JSON. Start with { — no markdown, no code fences.

{
  "n": "project name or Unknown",
  "t": "commercial|residential|industrial|medical|educational|mixed-use",
  "sf": 5000,
  "fl": 2,
  "c": 85,
  "s": "2-sentence description of what you see",
  "i": [
    {"cd":"03 30 00","nm":"Cast-in-Place Concrete","d":"Slab 5in thick 3000psi — 14,200 SF","q":263,"u":"CY","r":165,"tot":43395,"h":53},
    {"cd":"03 21 00","nm":"Reinforcing Steel","d":"#4 rebar @ 18in OC each way, slab","q":18000,"u":"LB","r":0.85,"tot":15300,"h":45}
  ],
  "sh": [
    {"p":1,"sn":"A-101","ti":"First Floor Plan","disc":"architectural"}
  ],
  "mc": 450000,
  "lc": 180000,
  "pc": 693000,
  "ct": 10,
  "rec": ["key risk or estimating note", "value engineering opportunity", "long-lead item"]
}

Keys: cd=CSI code, nm=name, d=description with dimensions, q=qty, u=unit, r=unit rate $, tot=total $, h=labor hours.
"sh" is the sheet register — one entry per drawing sheet you see: p=page number in this document, sn=sheet number, ti=title, disc=architectural|structural|civil|mechanical|electrical|plumbing|fire_protection|general.
CRITICAL MATH RULE: tot MUST equal q multiplied by r. Example: q=100, r=5.50 → tot=550. Never return tot=0.
VALID ITEMS ONLY: Every item must have q > 0 and r > 0. Never include items with unknown quantities — estimate from the drawing scale if dimensions are unclear. A 2000 SF floor plan at minimum has: excavation, concrete, framing, roofing, electrical, plumbing, HVAC, drywall, flooring — include ALL of these.
A complete commercial takeoff has 30-55 line items covering ALL trades visible in the drawings.`;

// ─── Index/classification pass prompt (large sets) ────────────────────────────
const INDEX_PROMPT = `You are a construction document-control specialist. This PDF contains multiple drawing sheets.
For EACH page, read the title block (usually lower-right) and identify the sheet.

Return ONLY raw JSON, start with {:
{
  "n": "project name or Unknown",
  "t": "commercial|residential|industrial|medical|educational|mixed-use",
  "sf": 0,
  "fl": 1,
  "s": "1-sentence overview of the project",
  "sh": [
    {"p":1,"sn":"A-101","ti":"First Floor Plan","disc":"architectural"}
  ]
}

p = 1-based page number in THIS document. sn = sheet number (e.g. "A-101", "S2.1", "M401"). ti = sheet title.
disc = one of: architectural|structural|civil|mechanical|electrical|plumbing|fire_protection|general|landscape.
List EVERY page you can see. Do NOT estimate any materials here — this is a sheet index only.`;

function deepPrompt(label: string, scope: string, sheetNumbers: string): string {
  return `You are a senior ${label} estimator. The attached pages are the ${label} drawings${sheetNumbers ? ` (sheets: ${sheetNumbers})` : ''}.
Produce a material takeoff for the ${label.toUpperCase()} SCOPE ONLY.

SCOPE (stay strictly inside this — other trades are estimated from their own sheets, so do NOT price them here):
${scope}

- Read every dimension callout and schedule on these sheets and compute real quantities (SF, LF, CY, SY, EA, LB, TON…).
- Count components: doors/windows/fixtures/equipment/members within this scope.
- Put the actual dimensions from the drawings in each description.
- Only include what THESE sheets show. Do not invent items from trades not drawn here.

Return ONLY raw JSON, start with {:
{
  "sf": 0,
  "fl": 1,
  "i": [
    {"cd":"03 30 00","nm":"Cast-in-Place Concrete","d":"Slab 5in 3000psi — 14,200 SF","q":263,"u":"CY","r":165,"tot":43395,"h":53}
  ]
}
Keys: cd=CSI code, nm=name, d=description with dimensions, q=qty, u=unit, r=unit rate $, tot=total $, h=labor hours.
CRITICAL: tot MUST equal q multiplied by r. Every item must have q > 0 and r > 0. sf/fl only if this discipline shows overall building area/floor count.`;
}

// ─── JSON repair & parse ──────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

function extractFirstJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let inStr = false, esc = false;
  const stack: string[] = [];
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if ((c === '}' || c === ']') && stack.length) {
      stack.pop();
      if (stack.length === 0) { end = i; break; }
    }
  }
  return end >= 0 ? text.slice(start, end + 1) : null;
}

function repairJson(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let result = s;
  if (inStr) result += '"';
  result = result.replace(/,\s*$/, '');
  while (stack.length) result += stack.pop()!;
  return result;
}

function safeJsonParse<T = any>(raw: string, label: string): T | null {
  const cleaned = stripFences(raw);
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const normalized = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
  const candidate = extractFirstJson(normalized);
  if (!candidate) { console.error(`[analyze/${label}] No JSON found`); return null; }
  try { return JSON.parse(candidate); } catch { /* continue */ }
  try { return JSON.parse(repairJson(candidate)); } catch (e) {
    console.error(`[analyze/${label}] parse failed:`, (e as Error).message, '| first 300:', raw.slice(0, 300));
    return null;
  }
}

// ─── Content block builder ────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'image';    source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'text';     text: string };

function buildContent(base64: string, mimeType: string, prompt: string): ContentBlock[] {
  if (mimeType === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: prompt },
    ];
  }
  const validImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mime = validImage.includes(mimeType) ? mimeType : 'image/jpeg';
  return [
    { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
    { type: 'text', text: prompt },
  ];
}

function bufToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Split a run of pages into groups whose extracted PDF each fit on the wire.
 *
 * A drawing set has no fixed bytes-per-sheet — a title sheet is tiny and a
 * dense mechanical plan is megabytes — so any "N pages per request" guess is
 * wrong for somebody. This measures instead: extract, check the encoded size,
 * and if it is over budget cut the range in half and try again. It terminates
 * at a single page, and a single page that still will not fit is reported
 * rather than silently dropped.
 *
 * This is what lets a 200-sheet set be indexed at all. Before it, the index
 * pass packed 60 sheets into one request, blew the limit, gave up quietly, and
 * the run fell back to sending the whole file — which failed too.
 */
async function batchPagesToFit(
  fileBuf: Buffer,
  pageIdx: number[],
  budget: number,
): Promise<{ batches: { pages: number[]; buf: Buffer }[]; oversized: number[] }> {
  const batches: { pages: number[]; buf: Buffer }[] = [];
  const oversized: number[] = [];

  const walk = async (pages: number[]): Promise<void> => {
    if (!pages.length) return;
    const buf = await extractPdfPages(fileBuf, pages);
    if (!buf) {
      if (pages.length === 1) { oversized.push(pages[0]); return; }
      const mid = Math.ceil(pages.length / 2);
      await walk(pages.slice(0, mid));
      await walk(pages.slice(mid));
      return;
    }
    if (encodedSize(buf.byteLength) <= budget) { batches.push({ pages, buf }); return; }
    if (pages.length === 1) { oversized.push(pages[0]); return; }
    const mid = Math.ceil(pages.length / 2);
    await walk(pages.slice(0, mid));
    await walk(pages.slice(mid));
  };

  await walk(pageIdx);
  return { batches, oversized };
}

/**
 * Turn a (sub-)PDF buffer into Claude content blocks. Inlines the PDF directly under
 * DOC_INLINE_MAX; above that, downshifts through processBlueprint (trim/rasterize).
 * Returns null if the buffer can't be sent at all.
 */
async function pdfContent(buf: Buffer, prompt: string): Promise<ContentBlock[] | null> {
  if (encodedSize(buf.byteLength) <= DOC_ENCODED_MAX) {
    return buildContent(buf.toString('base64'), 'application/pdf', prompt);
  }
  const p = await processBlueprint(bufToArrayBuffer(buf), 'application/pdf');
  if (p.error || !p.base64) return null;
  /* processBlueprint downshifts, but nothing guaranteed the result fits either.
     Refusing here is honest — the caller records the sheet as unread with a
     reason — and it beats a 413 that kills the whole analysis. */
  if (p.base64.length > DOC_ENCODED_MAX) {
    console.warn(`[analyze] downshifted document still too large: ${Math.round(p.base64.length / MB)}MB encoded`);
    return null;
  }
  return buildContent(p.base64, p.mimeType, prompt);
}

// ─── Item types ───────────────────────────────────────────────────────────────

interface CompactItem {
  cd?: string; nm?: string; d?: string;
  q?: number; u?: string; r?: number; tot?: number; h?: number;
  _src?: string; // discipline label the item came from (traceability)
}

interface SheetInfo { p?: number; sn?: string; ti?: string; disc?: string }

interface TakeoffResult {
  n?: string; t?: string; sf?: number; fl?: number;
  c?: number; s?: string; i?: CompactItem[]; sh?: SheetInfo[];
  mc?: number; lc?: number; pc?: number; ct?: number; rec?: string[];
}

interface SheetReg {
  page: number;
  sheetNumber: string;
  sheetTitle: string;
  discipline: Discipline;
  analyzed: boolean;
  skippedReason: string | null;
  itemCount: number;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();
  const { id: takeoffId } = await params;

  // Auth + tenant ownership BEFORE opening the stream — this route deletes+overwrites
  // takeoff data and burns AI spend, so an anonymous or cross-tenant caller must be
  // rejected outright (not handed an SSE stream).
  const user = await getUser(req).catch(() => null);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { data: owned } = await supabase
    .from('takeoffs').select('id').eq('id', takeoffId).eq('tenant_id', user.tenantId).single();
  if (!owned) return new Response('Takeoff not found', { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      // ── Helpers ──────────────────────────────────────────────────────────
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`)
          );
        } catch { /* controller closed */ }
      };

      const startHeartbeat = (message: string, pct: number, step: number) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          send('progress', { step, message, pct });
        }, 4000); // every 4s — keeps SSE + Vercel edge proxy alive
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      };

      const done = () => {
        stopHeartbeat();
        send('done', {});
        try { controller.close(); } catch { /* already closed */ }
      };

      const analyzeStartMs = Date.now();

      try {
        // ── 1. Load takeoff record ───────────────────────────────────────
        send('progress', { step: 1, message: 'Loading blueprint...', pct: 5 });

        const { data: takeoff, error: takeoffErr } = await supabase
          .from('takeoffs').select('*').eq('tenant_id', user.tenantId).eq('id', takeoffId).single();

        if (takeoffErr || !takeoff) {
          send('error', { message: 'Takeoff not found.' });
          return done();
        }

        if (!takeoff.storage_path && !takeoff.file_url) {
          await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
          send('error', { message: 'No blueprint uploaded. Please upload a file first.' });
          return done();
        }

        // ── 2. Mark as analyzing ─────────────────────────────────────────
        // Guard: if already analyzing (concurrent double-click), abort
        const { data: current } = await supabase.from('takeoffs').select('status').eq('tenant_id', user.tenantId).eq('id', takeoffId).single();
        if (current?.status === 'analyzing') {
          send('error', { message: 'Analysis already in progress for this takeoff.' });
          return done();
        }
        await must(supabase.from('takeoffs').update({ status: 'analyzing' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
        send('progress', { step: 2, message: 'Connecting to AI...', pct: 10 });

        // ── 3. Fetch file from storage (with heartbeat — can take 5-15s) ─
        send('progress', { step: 3, message: 'Downloading blueprint...', pct: 14 });
        startHeartbeat('Downloading blueprint...', 14, 3);

        const rawMime: string = takeoff.storage_path
          ? (takeoff.file_type || 'application/pdf')
          : 'application/pdf';

        let fileBuffer: ArrayBuffer;

        if (takeoff.storage_path) {
          const { data: blob, error: dlErr } = await supabase.storage
            .from('blueprints').download(takeoff.storage_path);
          stopHeartbeat();
          if (dlErr || !blob) {
            send('error', { message: 'Could not load blueprint from storage.' });
            return done();
          }
          fileBuffer = await blob.arrayBuffer();
        } else if (takeoff.file_url) {
          /* Legacy rows written before storage_path was recorded. The
             blueprints bucket is private now, so a bare fetch of the stored
             public-form URL would 400 — sign it first. signStoredUrl passes
             through anything it cannot parse, so a foreign URL still works. */
          const signed = await signStoredUrl('blueprints', takeoff.file_url, 600);
          const resp = await fetch(signed || takeoff.file_url);
          stopHeartbeat();
          if (!resp.ok) { send('error', { message: 'Could not load blueprint file.' }); return done(); }
          fileBuffer = await resp.arrayBuffer();
        } else {
          stopHeartbeat();
          send('error', { message: 'No blueprint file found.' });
          return done();
        }

        // ── 4. Anthropic setup ───────────────────────────────────────────
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // A single streaming vision pass. Text deltas keep the SSE + edge proxy alive.
        const runPass = async (
          content: ContentBlock[],
          maxTokens: number,
          step: number,
          message: string,
          pctFloor: number,
          pctCeil: number,
        ): Promise<string> => {
          // Keepalive covers the pre-first-token window (model latency before the first
          // delta) so the SSE/edge proxy never sees a silent gap between/inside passes.
          let started = false;
          const keepalive = setInterval(() => {
            if (!started) send('progress', { step, message: `${message}…`, pct: pctFloor });
          }, 4000);
          try {
            const s = await client.messages.create({
              model: MODEL,
              max_tokens: maxTokens,
              system: SYSTEM,
              messages: [{ role: 'user', content: content as any }],
              stream: true,
            });
            let acc = '';
            let last = Date.now();
            for await (const ev of s) {
              if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
                started = true;
                acc += ev.delta.text;
                const now = Date.now();
                if (now - last > 4000) {
                  const pct = Math.min(pctCeil, pctFloor + Math.floor((acc.length / 9000) * (pctCeil - pctFloor)));
                  send('progress', { step, message: `${message} (${acc.length} chars)`, pct });
                  last = now;
                }
              }
            }
            return acc;
          } finally {
            clearInterval(keepalive);
          }
        };

        const isImageInput = IMAGE_MIMES.includes(rawMime);
        const isPdfInput = !isImageInput;
        const fileBuf = Buffer.from(fileBuffer);

        // ── 5. Determine page count (honest ceiling) ─────────────────────
        let pageCount = 1;
        if (isPdfInput) {
          pageCount = (await getPdfPageCount(fileBuffer)) || Number(takeoff.page_count) || 1;
        }

        // ── 6. Analyze — adaptive single-pass vs. multi-sheet ────────────
        const meta: TakeoffResult = {};
        const allRawItems: CompactItem[] = [];
        const register: SheetReg[] = [];
        let pagesAnalyzed = 0;             // pages actually fed to the model
        const disciplinesAnalyzed: Discipline[] = [];
        const disciplinesSkipped: Array<{ discipline: Discipline; sheets: string[]; reason: string }> = [];
        let multiSheet = false;

        const mergeMeta = (src?: TakeoffResult | null) => {
          if (!src) return;
          if (!meta.n && src.n) meta.n = src.n;
          if (!meta.t && src.t) meta.t = src.t;
          if (!meta.s && src.s) meta.s = src.s;
          const sf = Number(src.sf) || 0;
          if (sf > (Number(meta.sf) || 0)) meta.sf = sf;
          const fl = Number(src.fl) || 0;
          if (fl > (Number(meta.fl) || 0)) meta.fl = fl;
          if (src.c && !meta.c) meta.c = src.c;
          if (src.lc && !meta.lc) meta.lc = src.lc;
          if (src.ct && !meta.ct) meta.ct = src.ct;
          if (Array.isArray(src.rec) && src.rec.length && !(meta.rec && meta.rec.length)) meta.rec = src.rec;
        };

        const canSinglePass = isImageInput || pageCount <= SINGLE_PASS_MAX_PAGES;

        // Tell the client which lane it's in as soon as we know the real page
        // count — the fast lane (single sheet / small set) is the only path we
        // claim "under 2 min" for; larger sets are read discipline-by-discipline
        // and honestly take a few minutes.
        send('lane', { fast: canSinglePass, pages: pageCount, image: isImageInput });

        // Try multi-sheet only for genuinely large PDFs; fall back to single pass if the
        // page split fails (encrypted/corrupt) so we never regress to an error.
        let didMultiSheet = false;
        if (isPdfInput && !canSinglePass) {
          const idxCount = Math.min(pageCount, INDEX_MAX_PAGES);
          /* The index used to be one request holding every sheet, which is fine
             for 20 title-block pages and impossible for 200 dense ones. It is
             cut into pieces that each fit, and the pieces are read at once —
             so the set size stops being a ceiling and becomes a page count. */
          const { batches: idxBatches, oversized: idxOversized } = await batchPagesToFit(
            fileBuf,
            Array.from({ length: idxCount }, (_, i) => i),
            DOC_ENCODED_MAX,
          );
          if (idxOversized.length) {
            console.warn(`[analyze] ${idxOversized.length} sheet(s) too large to index individually`);
          }
          if (idxBatches.length) {
            didMultiSheet = true;
            multiSheet = true;
            send('progress', {
              step: 4,
              message: idxBatches.length > 1
                ? `Indexing ${idxCount} sheets in ${idxBatches.length} parts…`
                : `Indexing ${idxCount} sheets…`,
              pct: 22,
            });

            const idxParts = await Promise.all(idxBatches.map(async (b, i) => {
              const content = await pdfContent(b.buf, INDEX_PROMPT);
              if (!content) return null;
              const raw = await runPass(content, 2500, 4, `Reading sheet index ${i + 1}/${idxBatches.length}`, 22, 38);
              return safeJsonParse<TakeoffResult>(raw, `index-${i}`);
            }));

            /* Merge the registers. Each part only saw its own pages, so the
               sheet rows concatenate; project-level metadata takes the first
               answer that has one. */
            const idx: TakeoffResult = { sh: [] };
            for (const part of idxParts) {
              if (!part) continue;
              mergeMeta(part);
              if (Array.isArray(part.sh)) idx.sh!.push(...part.sh);
            }
            {

              // Build the sheet register from the index (fallback: one row per page).
              const sheets: SheetInfo[] = Array.isArray(idx?.sh) && idx!.sh!.length
                ? idx!.sh!
                : Array.from({ length: idxCount }, (_, i) => ({ p: i + 1 }));
              const byPage = new Map<number, SheetReg>();
              for (const sh of sheets) {
                const page = Math.max(1, Math.round(Number(sh.p) || 0));
                if (!page || page > pageCount) continue;
                const disc = disciplineFromSheetNumber(sh.sn) || normalizeDiscipline(sh.disc) || 'general';
                byPage.set(page, {
                  page,
                  sheetNumber: String(sh.sn || '').trim(),
                  sheetTitle: String(sh.ti || '').trim(),
                  discipline: disc,
                  analyzed: false,
                  skippedReason: null,
                  itemCount: 0,
                });
              }
              // Pages the index pass never saw (beyond INDEX_MAX_PAGES) → honest skip rows.
              for (let p = 1; p <= pageCount; p++) {
                if (!byPage.has(p)) {
                  byPage.set(p, {
                    page: p, sheetNumber: '', sheetTitle: '', discipline: 'general',
                    analyzed: false,
                    skippedReason: p > idxCount ? 'beyond index limit' : 'not identified in index',
                    itemCount: 0,
                  });
                }
              }
              register.push(...Array.from(byPage.values()).sort((a, b) => a.page - b.page));

              // Group indexed pages by discipline, analyze in priority order within budget.
              const grouped = new Map<Discipline, SheetReg[]>();
              for (const r of register) {
                if (r.skippedReason) continue; // beyond-index pages aren't deep-analyzed
                if (!grouped.has(r.discipline)) grouped.set(r.discipline, []);
                grouped.get(r.discipline)!.push(r);
              }

              let deepPasses = 0;
              const orderedDiscs = DISCIPLINE_PRIORITY.filter((d) => grouped.has(d));

              /* The disciplines used to be read one after another — five
                 sequential AI passes, which is where the four minutes went.
                 They do not depend on each other: each reads its own sheets and
                 contributes its own line items, so they can run at once and the
                 wall clock becomes the slowest single pass instead of the sum.

                 The budget gates are the reason this needs care. They used to be
                 evaluated against counters that the loop itself mutated, which
                 cannot work when passes overlap. So the allowances are worked
                 out FIRST, in priority order, with no I/O — same gates, same
                 arithmetic, same honest skip reasons — and only then are the
                 passes dispatched. Results merge back in priority order, so the
                 output is identical whichever pass finishes first. */
              type Plan = {
                disc: typeof orderedDiscs[number];
                rows: typeof grouped extends Map<any, infer R> ? R : never;
                takeRows: any[];
                skipRows: any[];
                label: string;
                skipReason: string | null;
              };

              const plans: Plan[] = [];
              let plannedPages = 0;
              let plannedPasses = 0;

              for (const disc of orderedDiscs) {
                const rows = grouped.get(disc)!;
                const sheetLabels = rows.map((r) => r.sheetNumber || `p${r.page}`);

                let skipReason: string | null = null;
                if (plannedPasses >= MAX_DEEP_PASSES) skipReason = 'discipline-pass limit reached';
                else if (plannedPages >= MAX_ANALYZE_PAGES) skipReason = 'page-analysis limit reached';
                else if (Date.now() - analyzeStartMs > DEEP_BUDGET_MS) skipReason = 'time budget reached';

                if (skipReason) {
                  rows.forEach((r) => { r.skippedReason = skipReason; });
                  disciplinesSkipped.push({ discipline: disc, sheets: sheetLabels, reason: skipReason });
                  continue;
                }

                const allowance = Math.min(PER_DISCIPLINE_PAGES, MAX_ANALYZE_PAGES - plannedPages);
                const takeRows = rows.slice(0, allowance);
                const skipRows = rows.slice(allowance);

                plannedPages += takeRows.length;
                plannedPasses++;

                plans.push({
                  disc, rows: rows as any, takeRows, skipRows,
                  label: DISCIPLINE_LABEL[disc], skipReason: null,
                });

                if (skipRows.length > 0) {
                  const reason = allowance >= (MAX_ANALYZE_PAGES - (plannedPages - takeRows.length))
                    ? 'page-analysis limit reached'
                    : 'per-discipline page cap';
                  skipRows.forEach((r) => { r.skippedReason = reason; });
                  disciplinesSkipped.push({
                    discipline: disc,
                    sheets: skipRows.map((r) => r.sheetNumber || `p${r.page}`),
                    reason,
                  });
                }
              }

              if (plans.length) {
                send('progress', {
                  step: 4,
                  message: `Reading ${plans.length} disciplines at once…`,
                  pct: 40,
                });

                let finished = 0;
                const settled = await Promise.all(plans.map(async (plan) => {
                  try {
                    const pageIdx = plan.takeRows.map((r: any) => r.page - 1); // 0-based
                    const subBuf = await extractPdfPages(fileBuf, pageIdx);
                    if (!subBuf) return { plan, failure: 'sheet extraction failed' as const };

                    const content = await pdfContent(
                      subBuf,
                      deepPrompt(
                        plan.label,
                        DISCIPLINE_SCOPE[plan.disc],
                        plan.takeRows.map((r: any) => r.sheetNumber).filter(Boolean).join(', '),
                      ),
                    );
                    if (!content) return { plan, failure: 'sheet too large to analyze' as const };

                    /* Concurrent passes cannot each own a slice of the progress
                       bar, so it advances as each one lands. */
                    const raw = await runPass(content, 5000, 4, `Analyzing ${plan.label}`, 40, 78);
                    finished++;
                    send('progress', {
                      step: 4,
                      message: `${plan.label} done (${finished}/${plans.length})`,
                      pct: 40 + Math.floor((finished / plans.length) * 38),
                    });
                    return { plan, raw, failure: null };
                  } catch (err) {
                    console.error(`[analyze] discipline ${plan.disc} failed:`, err);
                    return { plan, failure: 'discipline pass failed' as const };
                  }
                }));

                /* Merge in priority order — Promise.all preserves input order, so
                   the result is identical no matter which pass returned first. */
                for (const r of settled) {
                  const { plan } = r;
                  const sheetLabels = plan.takeRows.map((x: any) => x.sheetNumber || `p${x.page}`);

                  if (r.failure) {
                    plan.takeRows.forEach((x: any) => { x.skippedReason = r.failure; });
                    disciplinesSkipped.push({ discipline: plan.disc, sheets: sheetLabels, reason: r.failure });
                    continue;
                  }

                  deepPasses++;
                  const parsedDisc = safeJsonParse<TakeoffResult>(r.raw!, `deep-${plan.disc}`);
                  mergeMeta(parsedDisc);

                  const items = Array.isArray(parsedDisc?.i) ? parsedDisc!.i! : [];
                  for (const it of items) { it._src = plan.label; allRawItems.push(it); }

                  plan.takeRows.forEach((x: any) => { x.analyzed = true; x.itemCount = items.length; });
                  pagesAnalyzed += plan.takeRows.length;
                  if (items.length > 0 || plan.takeRows.length > 0) disciplinesAnalyzed.push(plan.disc);
                }
              }
            }
          }
        }

        // ── Single-pass path (images, small sets, or multi-sheet fallback) ──
        if (!didMultiSheet) {
          send('progress', { step: 3, message: 'Preparing blueprint for AI...', pct: 20 });
          startHeartbeat('Preparing blueprint for AI...', 20, 3);
          const processed = await processBlueprint(fileBuffer, rawMime);
          if (!processed.error && processed.base64 && processed.base64.length > DOC_ENCODED_MAX) {
            /* Same ceiling as the multi-sheet path. Without this the request
               leaves oversized and Anthropic answers 413 — which reads to a GC
               as "the app cannot open my drawings". */
            send('error', {
              message: 'This drawing set is too large to read in one pass. Split it by discipline and upload again.',
            });
            await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
            return done();
          }
          stopHeartbeat();
          if (processed.error) {
            send('error', { message: processed.error });
            await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
            return done();
          }
          send('progress', { step: 4, message: 'AI is reading your blueprint...', pct: 25 });
          const raw = await runPass(
            buildContent(processed.base64, processed.mimeType, COMBINED_PROMPT),
            8000, 4, 'AI analyzing blueprint', 25, 72,
          );
          const parsed = safeJsonParse<TakeoffResult>(raw, 'main');
          if (!parsed) {
            console.error('[analyze] No JSON parsed. Raw:', raw.slice(0, 500));
            send('error', { message: 'AI returned an unexpected format. Please try again.' });
            await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
            return done();
          }
          if ('error' in parsed && typeof (parsed as any).error === 'string') {
            send('error', { message: (parsed as any).error });
            await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
            return done();
          }
          mergeMeta(parsed);
          for (const it of (parsed.i || [])) allRawItems.push(it);
          // Register from the single pass (or synthesize per page).
          const singleSheets: SheetInfo[] = Array.isArray(parsed.sh) && parsed.sh.length
            ? parsed.sh
            : (isPdfInput
                ? Array.from({ length: Math.min(pageCount, 8) }, (_, i) => ({ p: i + 1 }))
                : [{ p: 1, ti: takeoff.file_name || 'Blueprint' }]);
          for (const sh of singleSheets) {
            const page = Math.max(1, Math.round(Number(sh.p) || 1));
            const disc = disciplineFromSheetNumber(sh.sn) || normalizeDiscipline(sh.disc) || 'architectural';
            register.push({
              page,
              sheetNumber: String(sh.sn || '').trim(),
              sheetTitle: String(sh.ti || '').trim(),
              discipline: disc,
              analyzed: true,
              skippedReason: null,
              itemCount: parsed.i?.length || 0,
            });
            if (!disciplinesAnalyzed.includes(disc)) disciplinesAnalyzed.push(disc);
          }
          pagesAnalyzed = isPdfInput ? Math.min(pageCount, 8) : 1;
        }

        send('progress', { step: 5, message: 'Processing AI results...', pct: 75 });

        // ── 7. Honesty accounting ────────────────────────────────────────
        const analyzedSheetCount = register.filter((r) => r.analyzed).length || pagesAnalyzed;
        const skippedSheetCount = Math.max(0, pageCount - analyzedSheetCount);
        const truncated = skippedSheetCount > 0;

        const disciplinesAnalyzedLabels = [...new Set(disciplinesAnalyzed)].map((d) => DISCIPLINE_LABEL[d]);
        const skippedByReason = new Map<string, string[]>();
        for (const s of disciplinesSkipped) {
          const key = `${DISCIPLINE_LABEL[s.discipline]} (${s.reason})`;
          if (!skippedByReason.has(key)) skippedByReason.set(key, []);
          skippedByReason.get(key)!.push(...s.sheets);
        }
        const truncationNote = truncated
          ? `Heads up: this ${pageCount}-page set is larger than one analysis can fully read. ` +
            `We analyzed ${analyzedSheetCount} sheet${analyzedSheetCount === 1 ? '' : 's'} ` +
            `(${disciplinesAnalyzedLabels.join(', ') || 'primary disciplines'}) and did NOT read ` +
            `${skippedSheetCount} sheet${skippedSheetCount === 1 ? '' : 's'}` +
            (skippedByReason.size
              ? ` — skipped: ${[...skippedByReason.keys()].join('; ')}.`
              : '.') +
            ` Re-run per discipline, or split the set, to capture the rest.`
          : `Analyzed all ${analyzedSheetCount} sheet${analyzedSheetCount === 1 ? '' : 's'}` +
            (multiSheet && disciplinesAnalyzedLabels.length ? ` across ${disciplinesAnalyzedLabels.join(', ')}.` : '.');

        // Surface honesty in the recommendations list the UI already renders.
        const baseRecs = Array.isArray(meta.rec) ? meta.rec.filter((r) => typeof r === 'string') : [];
        const recommendations = truncated ? [truncationNote, ...baseRecs] : baseRecs;

        send('progress', { step: 6, message: 'Saving materials to database...', pct: 85 });

        // ── 8. Load THIS GC's learned/manual rates (close the learning loop) ──
        // The measured path prices with the tenant's cost_rates via costKey; the AI path
        // only has the model's per-line guess. Here we reconcile: resolve each AI line to
        // an engine costKey (deterministic, lib/takeoff.costKeyForCsiLine) and, WHERE the
        // GC has a learned/manual rate for it, OVERRIDE the model's rate with the GC's real
        // number — so every AI blueprint takeoff prices with this contractor's own numbers
        // and gets sharper as their history grows. No rate → keep the model's rate.
        const { data: rateRows } = await (supabase as any)
          .from('cost_rates').select('cost_key,material_cents,source').eq('tenant_id', user.tenantId);
        const tenantRates: Record<string, { cents: number; source: string }> = {};
        for (const rr of (rateRows || []) as any[]) {
          if (rr.material_cents != null && Number(rr.material_cents) >= 0) {
            tenantRates[rr.cost_key] = { cents: Number(rr.material_cents), source: rr.source };
          }
        }
        // Win/loss competitive pricing — OFF unless this tenant is entitled (fail-closed).
        // When off, wf=1 → AI line prices are unchanged; keeps parity with the engine path.
        const applyWinFactors = await hasFeature(user.tenantId, 'win_loss_pricing');
        const winFactorByDivision: Record<string, number> = {};
        if (applyWinFactors) {
          const { data: wfRows } = await (supabase as any)
            .from('trade_win_factors').select('csi_division,suggested_multiplier').eq('tenant_id', user.tenantId);
          for (const w of (wfRows || []) as any[]) if (w.csi_division) winFactorByDivision[String(w.csi_division)] = Number(w.suggested_multiplier) || 1;
        }
        let overrideCount = 0;
        /** Resolve costKey, apply the tenant-rate override, then the competitive win factor. */
        const priceLine = (csiCode: string, unit: string, text: string, aiRate: number) => {
          const costKey = costKeyForCsiLine(csiCode, unit, text);
          const t = costKey ? tenantRates[costKey] : undefined;
          const wf = applyWinFactors ? (winFactorByDivision[(csiCode || '').slice(0, 2)] ?? 1) : 1;
          if (t) { overrideCount++; return { unitCost: (t.cents / 100) * wf, costKey, overridden: true, competitiveFactor: wf }; }
          return { unitCost: aiRate * wf, costKey: costKey ?? null, overridden: false, competitiveFactor: wf };
        };

        // ── 8b. Expand items & save to DB ────────────────────────────────
        let items = allRawItems
          .map((item: CompactItem, idx: number) => {
            const qty      = Math.max(0, Number(item.q) || 0);
            const laborHrs = Math.max(0, Number(item.h) || 0);
            const unit     = String(item.u || 'LS').trim().toUpperCase();
            const rawCode = String(item.cd || '').trim().replace(/[^\d\s]/g, '');
            const digits = rawCode.replace(/\s+/g, '').padEnd(6, '0').slice(0, 6);
            const csiCode = digits.length >= 6
              ? `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`
              : rawCode || '00 00 00';
            // Reconcile the model's rate against the GC's learned/manual rate.
            const aiRate = Math.max(0, Number(item.r) || 0);
            const priced = priceLine(csiCode, unit, `${item.nm || ''} ${item.d || ''}`, aiRate);
            const unitCost = priced.unitCost;
            const computed = qty * unitCost;
            // When the GC's own rate drives the line, the price is deterministic (qty × rate).
            // Only when we fall back to the model's rate do we honor the model's rounded tot.
            const claudeTot = Number(item.tot) || 0;
            const totalCost = priced.overridden
              ? computed
              : (claudeTot > 0 && computed > 0 && Math.abs(claudeTot - computed) / (computed || 1) < 0.10
                  ? claudeTot
                  : computed);
            return {
              takeoff_id:  takeoffId,
              tenant_id:   user.tenantId,
              csi_code:    csiCode,
              csi_name:    String(item.nm || '').trim() || 'General',
              description: String(item.d  || '').trim() || 'See specifications',
              quantity:    qty,
              unit,
              unit_cost:   unitCost,
              total_cost:  totalCost,
              labor_hours: laborHrs,
              notes:       item._src ? `${item._src} sheets` : '',
              sort_order:  idx,
              cost_key:    priced.costKey,
              competitive_factor: priced.competitiveFactor ?? 1,
            };
          })
          .filter((it) => it.description.length > 0 && it.quantity > 0 && it.unit_cost > 0);

        console.log(`[analyze] items: ${allRawItems.length} raw → ${items.length} valid after filtering (multiSheet=${multiSheet})`);

        if (items.length === 0 && allRawItems.length > 0) {
          console.warn('[analyze] All items filtered out — attempting salvage. Raw count:', allRawItems.length);
          const salvaged = allRawItems
            .map((item: CompactItem, idx: number) => {
              const csiCode = String(item.cd || '00 00 00').trim();
              const unit    = String(item.u || 'LS').trim().toUpperCase();
              const qty     = Math.max(1, Number(item.q) || 1);
              // Apply the GC's learned/manual rate here too; fall back to the model's rate.
              const priced  = priceLine(csiCode, unit, `${item.nm || ''} ${item.d || ''}`, Math.max(0.01, Number(item.r) || 0));
              const unitCost = Math.max(0.01, priced.unitCost);
              return {
                takeoff_id:  takeoffId,
                tenant_id:   user.tenantId,
                csi_code:    csiCode,
                csi_name:    String(item.nm || '').trim() || 'General',
                description: String(item.d  || '').trim() || 'See specifications',
                quantity:    qty,
                unit,
                unit_cost:   unitCost,
                total_cost:  Math.max(0.01, qty * unitCost),
                labor_hours: Math.max(0, Number(item.h) || 0),
                notes:       item._src ? `${item._src} sheets — verify quantities` : 'AI confidence low — verify quantities',
                sort_order:  idx,
                cost_key:    priced.costKey,
                competitive_factor: priced.competitiveFactor ?? 1,
              };
            })
            .filter((it) => it.description.length > 0);

          if (salvaged.length > 0) {
            console.log(`[analyze] Salvaged ${salvaged.length} items with fallback quantities`);
            items = salvaged;
          } else {
            send('error', { message: 'AI returned items but could not extract usable data. Try a higher-resolution blueprint or a clearer PDF.' });
            await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
            return done();
          }
        }
        if (items.length === 0) {
          send('error', { message: 'No materials extracted from this blueprint. Try a clearer image or a PDF with visible dimensions.' });
          await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
          return done();
        }

        // Derive real totals from validated line items — don't trust Claude's mc/lc/pc
        const realMaterialTotal = items.reduce((s, it) => s + it.total_cost, 0);
        const claudeLc = Number(meta.lc) || 0;
        const computedLc = items.reduce((s, it) => s + it.labor_hours * 65, 0);
        const realLaborTotal = claudeLc > 0 && claudeLc < realMaterialTotal * 3
          ? claudeLc
          : computedLc;
        const contingencyPct = Math.max(0, Math.min(50, Number(meta.ct) || 10));
        const subtotal = realMaterialTotal + realLaborTotal;
        const realProjectTotal = Math.round(subtotal * (1 + contingencyPct / 100));

        // Delete then insert materials. The resolved cost_key rides along so completed AI
        // takeoffs also feed the learning loop — but that column is NEW: on a pre-migration
        // DB the insert would fail, so we transparently retry the batch without cost_key.
        const { error: delErr } = await supabase.from('takeoff_materials').delete().eq('tenant_id', user.tenantId).eq('takeoff_id', takeoffId);
        if (delErr) console.warn('[analyze] delete materials warning:', delErr.message);
        const stripCostKey = (batch: any[]) => batch.map((r) => { const c = { ...r }; delete c.cost_key; return c; });
        let costKeyUnsupported = false;
        const BATCH = 50;
        for (let i = 0; i < items.length; i += BATCH) {
          const batch = items.slice(i, i + BATCH);
          const payload = costKeyUnsupported ? stripCostKey(batch) : batch;
          const { error: insErr } = await supabase.from('takeoff_materials').insert(payload);
          if (insErr && !costKeyUnsupported && /cost_key/i.test(insErr.message || '')) {
            // Column not migrated yet — drop it and retry this batch, then all remaining ones.
            costKeyUnsupported = true;
            console.warn('[analyze] takeoff_materials.cost_key missing — persisting without it (run migration to enable AI-fed learning).');
            const { error: retryErr } = await supabase.from('takeoff_materials').insert(stripCostKey(batch));
            if (retryErr) console.error(`[analyze] insert batch ${i}-${i + BATCH} retry error:`, retryErr.message);
          } else if (insErr) {
            console.error(`[analyze] insert batch ${i}-${i + BATCH} error:`, insErr.message);
          }
        }
        console.log(`[analyze] tenant-rate overrides applied to ${overrideCount}/${items.length} lines`);

        // ── 9. Persist the sheet register (NON-FATAL: table may predate migration) ──
        try {
          // takeoff_analysis_sheets is created by this task's migration and not yet in the
          // generated Database types — cast until `db:types` is regenerated post-migration.
          const sheetsTable = () => (supabase as any).from('takeoff_analysis_sheets');
          await sheetsTable().delete().eq('takeoff_id', takeoffId).eq('tenant_id', user.tenantId);
          if (register.length > 0) {
            const regRows = register.map((r, i) => ({
              takeoff_id: takeoffId,
              tenant_id: user.tenantId,
              page_index: r.page,
              sheet_number: r.sheetNumber || null,
              sheet_title: r.sheetTitle || null,
              discipline: r.discipline,
              analyzed: r.analyzed,
              skipped_reason: r.skippedReason,
              item_count: r.itemCount,
              sort_order: i,
            }));
            const { error: regErr } = await sheetsTable().insert(regRows);
            if (regErr) console.warn('[analyze] sheet register insert (non-fatal):', regErr.message);
          }
        } catch (e) {
          console.warn('[analyze] sheet register skipped (non-fatal):', e instanceof Error ? e.message : e);
        }

        // ── 10. Update takeoff summary — validated totals + honesty metadata ──
        const coverageConf = pageCount > 0 ? analyzedSheetCount / pageCount : 1;
        const rawConf = Number(meta.c) || 0;
        const confidence = multiSheet
          ? Math.max(0, Math.min(92, Math.round(45 + 47 * coverageConf)))
          : Math.max(0, Math.min(100, Math.round(rawConf)));
        const buildingArea = Math.max(0, Math.min(10_000_000, Math.round(Number(meta.sf) || 0)));
        const floorCount = Math.max(1, Math.min(200, Math.round(Number(meta.fl) || 1)));
        const elapsedMs = Date.now() - analyzeStartMs;

        const { error: updateErr } = await supabase.from('takeoffs').update({
          status:                'complete',
          building_area:         buildingArea,
          floor_count:           floorCount,
          total_cost:            realProjectTotal,
          confidence:            confidence,
          project_name_detected: meta.n   || '',
          building_type:         meta.t   || '',
          summary:               meta.s   || '',
          recommendations:       recommendations,
          material_cost:         realMaterialTotal,
          labor_cost:            realLaborTotal,
          contingency_pct:       contingencyPct,
          analyzed_at:           new Date().toISOString(),
          // honesty columns (all pre-existing on takeoffs)
          page_count:            pageCount,
          pages_processed:       analyzedSheetCount,
          extraction_notes:      truncationNote,
          ai_model_used:         MODEL,
        }).eq('tenant_id', user.tenantId).eq('id', takeoffId);

        if (updateErr) console.error('[analyze] update takeoff error:', updateErr);

        // analyze_elapsed_ms is a NEW column — write separately so a pre-migration DB
        // (column absent) still persists everything above instead of failing the whole update.
        try {
          // analyze_elapsed_ms added by this task's migration — cast until types regenerate.
          const { error: elapsedErr } = await (supabase as any).from('takeoffs')
            .update({ analyze_elapsed_ms: elapsedMs }).eq('tenant_id', user.tenantId).eq('id', takeoffId);
          if (elapsedErr) console.warn('[analyze] analyze_elapsed_ms not persisted (run migration):', elapsedErr.message);
        } catch (e) {
          console.warn('[analyze] analyze_elapsed_ms skipped (non-fatal):', e instanceof Error ? e.message : e);
        }

        // ── Close the learning loop: this finished takeoff refreshes learned cost_rates ──
        // (tenant-scoped, source:'learned', never clobbering manual). Non-fatal — a learn
        // failure must not fail the analysis the user just paid for.
        try {
          const learned = await learnTenantRates(supabase as any, user.tenantId);
          console.log(`[analyze] auto-learn: ${learned.learned} learned from ${learned.fromLines} priced lines (kept ${learned.skippedManual} manual)`);
        } catch (e) {
          console.warn('[analyze] auto-learn skipped (non-fatal):', e instanceof Error ? e.message : e);
        }

        send('progress', { step: 7, message: 'Complete!', pct: 100 });

        // ── 11. Result event ─────────────────────────────────────────────
        const expandedItems = items.map((row) => ({
          csiCode:     row.csi_code,
          csiDivision: row.csi_code.slice(0, 2),
          csiName:     row.csi_name,
          description: row.description,
          quantity:    row.quantity,
          unit:        row.unit,
          unitCost:    row.unit_cost,
          totalCost:   row.total_cost,
          laborHours:  row.labor_hours,
          notes:       row.notes || '',
        }));

        /* A takeoff is the single biggest thing that happens to a job before
           anyone is paid — a drawing becomes a priced scope — and it left no
           trace. */
        void logActivity({
          tenantId: user.tenantId,
          projectId: (takeoff as Record<string, any>)?.project_id ?? null,
          userId: user.id,
          userName: user.email,
          action: 'takeoff_completed',
          entityType: 'takeoff',
          entityId: takeoffId,
          description: `Took off ${meta.n || 'the drawings'} — ${expandedItems.length} line items, ${money(realProjectTotal)}`,
          metadata: { itemCount: expandedItems.length, total: realProjectTotal, sheets: analyzedSheetCount, confidence },
        });

        send('result', {
          takeoffId,
          projectName:       meta.n   || '',
          buildingType:      meta.t   || '',
          estimatedSF:       buildingArea,
          /* Already extracted from the drawings and written to the row; it was
             just never sent, so the client drew a building out of the price. */
          floorCount:        floorCount,
          confidence:        confidence,
          summary:           meta.s   || '',
          items:             expandedItems,
          totalMaterialCost: realMaterialTotal,
          totalLaborCost:    realLaborTotal,
          totalProjectCost:  realProjectTotal,
          contingency:       contingencyPct,
          recommendations:   recommendations,
          itemCount:         expandedItems.length,
          // honesty payload
          pagesTotal:        pageCount,
          pagesAnalyzed:     analyzedSheetCount,
          sheetsTotal:       pageCount,
          sheetsAnalyzed:    analyzedSheetCount,
          sheetsSkipped:     skippedSheetCount,
          disciplines:       disciplinesAnalyzedLabels,
          truncated,
          truncationNote,
          elapsedMs,
          elapsedSec:        Math.round(elapsedMs / 100) / 10,
          multiSheet,
        });

        done();

      } catch (err: unknown) {
        stopHeartbeat();
        let message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        if (
          message.toLowerCase().includes('prompt is too long') ||
          message.toLowerCase().includes('context length')
        ) {
          message = 'Blueprint is too large for AI analysis. Try a smaller file or fewer PDF pages.';
        }
        console.error('[takeoff/analyze]', err);
        send('error', { message });
        try {
          await tryWrite(supabase.from('takeoffs').update({ status: 'failed' }).eq('tenant_id', user.tenantId).eq('id', takeoffId), 'takeoffs update');
        } catch { /* non-fatal */ }
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
