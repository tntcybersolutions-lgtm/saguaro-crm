/**
 * lib/sage-brain.ts
 * SAGE BRAIN OVERHAUL (R16–R19). Server-only.
 *
 * R16 — Adaptive communication style: a transparent, per-user style profile
 *       computed from the user's REAL content inside the platform, stored
 *       visibly (sage_style_profiles), editable + toggleable in Sage's own UI.
 *       The profile_text stored is the EXACT text injected into the prompt.
 * R17 — Bid brain: win-rate by markup band from real bid history, with
 *       sample-size honesty (n < 5 → "not enough history yet", never fake
 *       confidence), plus workflow-efficiency suggestions with the WHY.
 * R18 — Consent-first automation: explicit GC-approved rules
 *       (sage_automation_rules), all visible + revocable, every action logged
 *       to sage_activity_log.
 * R19 — General assistant honesty block: what Sage can and cannot reach.
 *
 * All new-table access is TOLERANT: the 064_sage_brain.sql migration may not
 * be applied yet, so every query is wrapped and failures degrade to null/[]
 * without breaking chat.
 */

import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CONFIGURATION — honest fallback, never a silent failure
// ─────────────────────────────────────────────────────────────────────────────

export function isSageEngineConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const SAGE_ENGINE_UNCONFIGURED_MESSAGE =
  "Sage's reasoning engine isn't configured yet on this server (missing ANTHROPIC_API_KEY). " +
  'Nothing is broken with your data — but Sage cannot think until an administrator adds the key. ' +
  'This is a real status message, not a canned answer.';

// ─────────────────────────────────────────────────────────────────────────────
// R16 — TRANSPARENT STYLE PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export interface SageStyleDimensions {
  brevity: number;         // 1 = loves detail … 10 = wants it ultra-short
  formality: number;       // 1 = very casual … 10 = formal
  emoji_use: number;       // 1 = none … 10 = frequent
  directness: number;      // 1 = conversational … 10 = commands, no padding
  technical_depth: number; // 1 = plain-English … 10 = full construction jargon
  humor: number;           // 1 = all business … 10 = jokes often
}

export interface SageStyleProfile extends SageStyleDimensions {
  id?: string;
  user_id: string;
  tenant_id: string | null;
  enabled: boolean;
  profile_text: string;
  sample_count: number;
  sources: string[];
  user_edited: boolean;
  computed_at: string | null;
}

const clamp10 = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

/** Pure heuristic analysis over the user's real message texts. */
export function computeStyleDimensions(texts: string[]): { dims: SageStyleDimensions; sampleCount: number } {
  const clean = texts.map((t) => (t || '').trim()).filter((t) => t.length > 0);
  const n = clean.length;
  if (n === 0) {
    return {
      dims: { brevity: 5, formality: 5, emoji_use: 1, directness: 5, technical_depth: 5, humor: 1 },
      sampleCount: 0,
    };
  }
  const all = clean.join(' ');
  const lower = all.toLowerCase();
  const avgLen = clean.reduce((s, t) => s + t.length, 0) / n;

  // Brevity: shorter average messages → they want brevity back.
  const brevity = clamp10(avgLen < 40 ? 9 : avgLen < 90 ? 7 : avgLen < 180 ? 5 : avgLen < 350 ? 4 : 3);

  // Formality
  const slang = ['gonna', 'wanna', 'gotta', 'yep', 'nope', 'lemme', 'kinda', 'lol', 'bro', 'yo', 'idk', 'asap', 'dude', 'ya', 'nah'];
  const slangHits = slang.filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).length;
  const formalHits = [/\bplease\b/i, /\bthank you\b/i, /\bregarding\b/i, /\bsincerely\b/i, /\bkind regards\b/i]
    .filter((p) => p.test(all)).length;
  const formality = clamp10(5 - Math.min(3, slangHits) + Math.min(3, formalHits));

  // Emoji use
  const emojiMatches = all.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? [];
  const emojiRate = emojiMatches.length / n;
  const emoji_use = clamp10(emojiRate >= 1 ? 8 : emojiRate >= 0.3 ? 5 : emojiRate > 0 ? 3 : 1);

  // Directness: imperative openers vs. hedged questions
  const commands = clean.filter((t) => /^(get|show|give|tell|make|run|check|find|create|draft|write|send|list|pull|calc|calculate|fix|update)\b/i.test(t)).length;
  const hedges = clean.filter((t) => /\b(could you|would you|maybe|if possible|when you get a chance)\b/i.test(t)).length;
  const directness = clamp10(5 + Math.round((commands / n) * 6) - Math.round((hedges / n) * 4));

  // Technical depth: construction vocabulary density
  const jargon = ['rfi', 'submittal', 'sov', 'g702', 'g703', 'retainage', 'lien', 'prelim', 'pay app', 'change order', 'pco', 'csi', 'coi', 'davis-bacon', 'punch', 'gmp', 'closeout', 'takeoff', 'wh-347'];
  const jargonHits = jargon.filter((w) => lower.includes(w)).length;
  const technical_depth = clamp10(3 + jargonHits);

  // Humor
  const humorHits = [/\blol\b/i, /\bhaha+\b/i, /😂|🤣/u, /\bjk\b/i, /kidding/i].filter((p) => p.test(all)).length;
  const humor = clamp10(1 + humorHits * 2);

  return { dims: { brevity, formality, emoji_use, directness, technical_depth, humor }, sampleCount: n };
}

const dimWord = (v: number, low: string, mid: string, high: string) =>
  v <= 3 ? low : v <= 7 ? mid : high;

/** Renders the human-readable profile text. THIS EXACT TEXT is injected into the prompt and shown to the user. */
export function renderStyleProfileText(dims: SageStyleDimensions, sampleCount: number, sources: string[]): string {
  const lines = [
    `Inferred from ${sampleCount} of your real messages in Saguaro (${sources.length ? sources.join(', ') : 'no sources yet'}).`,
    `- Brevity ${dims.brevity}/10 — ${dimWord(dims.brevity, 'they like detail and context', 'balanced length', 'keep it short; every word must earn its place')}.`,
    `- Formality ${dims.formality}/10 — ${dimWord(dims.formality, 'casual, conversational', 'professional but relaxed', 'formal, structured')}.`,
    `- Emoji ${dims.emoji_use}/10 — ${dimWord(dims.emoji_use, 'do not use emoji', 'an occasional emoji is fine', 'emoji are welcome')}.`,
    `- Directness ${dims.directness}/10 — ${dimWord(dims.directness, 'soften delivery a little', 'straightforward', 'no padding, lead with the answer')}.`,
    `- Technical depth ${dims.technical_depth}/10 — ${dimWord(dims.technical_depth, 'plain English, define terms', 'standard construction terminology', 'full jargon, peer-level')}.`,
    `- Humor ${dims.humor}/10 — ${dimWord(dims.humor, 'all business', 'light humor OK when they start it', 'they joke around — match it once they do')}.`,
  ];
  return lines.join('\n');
}

/**
 * Loads the stored style profile; computes one from the user's real platform
 * content when missing or stale (7+ days) and not user-edited.
 * Tolerant of the sage_style_profiles table not existing yet (returns computed
 * profile without persisting).
 */
export async function loadOrComputeStyleProfile(
  userId: string,
  tenantId: string
): Promise<SageStyleProfile | null> {
  const db = createServerClient();

  let stored: SageStyleProfile | null = null;
  try {
    const { data } = await (db as any)
      .from('sage_style_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    stored = (data as SageStyleProfile | null) ?? null;
  } catch {
    stored = null;
  }

  const isStale =
    !stored?.computed_at ||
    Date.now() - new Date(stored.computed_at).getTime() > 7 * 24 * 3600_000;

  if (stored && (stored.user_edited || !isStale)) return stored;

  // ── Gather the user's REAL content from within the platform ────────────────
  const texts: string[] = [];
  const sources: string[] = [];

  try {
    const { data } = await db
      .from('sage_messages')
      .select('content')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{ content: string }>;
    if (rows.length > 0) {
      texts.push(...rows.map((r) => r.content));
      sources.push('Sage chat messages');
    }
  } catch { /* tolerant */ }

  try {
    const { data } = await (db as any)
      .from('daily_logs')
      .select('notes')
      .eq('tenant_id', tenantId)
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    const rows = (data ?? []) as Array<{ notes: string | null }>;
    const notes = rows.map((r) => r.notes ?? '').filter((t) => t.trim().length > 0);
    if (notes.length > 0) {
      texts.push(...notes);
      sources.push('daily log notes');
    }
  } catch { /* tolerant */ }

  const { dims, sampleCount } = computeStyleDimensions(texts);
  const profile_text = renderStyleProfileText(dims, sampleCount, sources);

  const computed: SageStyleProfile = {
    user_id: userId,
    tenant_id: tenantId,
    enabled: stored?.enabled ?? true,
    ...dims,
    profile_text,
    sample_count: sampleCount,
    sources,
    user_edited: false,
    computed_at: new Date().toISOString(),
  };

  // Persist (tolerant — table may not exist yet)
  try {
    await must((db as any).from('sage_style_profiles').upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        enabled: computed.enabled,
        brevity: dims.brevity,
        formality: dims.formality,
        emoji_use: dims.emoji_use,
        directness: dims.directness,
        technical_depth: dims.technical_depth,
        humor: dims.humor,
        profile_text,
        sample_count: sampleCount,
        sources,
        user_edited: false,
        computed_at: computed.computed_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    ), 'sage_style_profiles upsert');
  } catch { /* tolerant until migration applied */ }

  return computed;
}

/** Prompt section for R16. Returns null when the profile is toggled off. */
export function buildStyleBlock(profile: SageStyleProfile | null): string | null {
  if (!profile) return null;
  if (!profile.enabled) {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION STYLE — MIRRORING DISABLED BY USER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This user turned OFF style mirroring in Sage settings. Use a neutral,
professional default: direct, clear, no emoji, no slang, moderate length.
Do not attempt to imitate their writing style.`.trim();
  }
  if (profile.sample_count === 0) {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION STYLE — NO HISTORY YET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No message history to learn from yet. Use a professional default and mirror
the length and tone of each incoming message.`.trim();
  }
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION STYLE PROFILE — TRANSPARENT, USER-VISIBLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The profile below was computed from this user's real writing inside Saguaro.
The user can see this EXACT text in Sage settings, edit it, or turn it off —
so honor it faithfully, and if asked "how do you know how I write?", explain
it honestly and point them to Sage settings.

${profile.profile_text}

Mirror these dimensions in tone, length, formality, and vocabulary. Never
sacrifice accuracy or the Conduct Mandate to match style.`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// R17 — BID BRAIN
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkupBand {
  band: string;          // e.g. "10–15%"
  min: number;
  max: number | null;
  n: number;
  wins: number;
  winRate: number | null;       // null when n < 5 — not enough history
  expectedValue: number | null; // winRate × band-midpoint margin (%); null when winRate is null
}

export interface WorkflowSuggestion {
  suggestion: string;
  why: string;
}

export interface BidBrainAnalysis {
  totalBids: number;
  decidedBids: number;
  wonBids: number;
  overallWinRate: number | null; // null when decidedBids < 5
  enoughHistory: boolean;        // decidedBids >= 5
  bandsWithMarkup: number;       // decided bids where a markup % could be derived
  bands: MarkupBand[];
  markupAdvice: string | null;   // only set with real sample support
  workflowSuggestions: WorkflowSuggestion[];
}

const WON_STATUSES = ['won', 'win', 'awarded', 'accepted'];
const LOST_STATUSES = ['lost', 'lose', 'declined', 'rejected', 'not_awarded'];

const BAND_DEFS: Array<{ band: string; min: number; max: number | null; midpoint: number }> = [
  { band: 'under 5%', min: -Infinity, max: 5, midpoint: 2.5 },
  { band: '5–10%', min: 5, max: 10, midpoint: 7.5 },
  { band: '10–15%', min: 10, max: 15, midpoint: 12.5 },
  { band: '15–20%', min: 15, max: 20, midpoint: 17.5 },
  { band: '20%+', min: 20, max: null, midpoint: 22.5 }, // open-ended — midpoint approximated
];

/** Computes win-rate by markup band from real bid history. Money columns can be TEXT — always Number(). */
export async function loadBidBrain(tenantId: string): Promise<BidBrainAnalysis> {
  const db = createServerClient();
  const N = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);

  let bids: any[] = [];
  try {
    const { data } = await (db as any)
      .from('bids')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    bids = data ?? [];
  } catch {
    bids = [];
  }

  const statusOf = (b: any) => String(b.status ?? '').toLowerCase();
  const isWon = (b: any) => WON_STATUSES.includes(statusOf(b)) || Boolean(b.won_at);
  const isLost = (b: any) => LOST_STATUSES.includes(statusOf(b)) || Boolean(b.lost_at);

  const decided = bids.filter((b) => isWon(b) || isLost(b));
  const won = decided.filter(isWon);

  // Markup % per decided bid: prefer explicit margin_pct; else derive from cost.
  const markupOf = (b: any): number | null => {
    const explicit = N(b.margin_pct);
    if (explicit > 0) return explicit;
    const amount = N(b.bid_amount);
    const cost = N(b.actual_cost) || N(b.estimated_cost);
    if (amount > 0 && cost > 0 && amount > cost) return ((amount - cost) / cost) * 100;
    return null;
  };

  const bands: MarkupBand[] = BAND_DEFS.map((def) => {
    const inBand = decided.filter((b) => {
      const m = markupOf(b);
      if (m == null) return false;
      return m >= def.min && (def.max == null || m < def.max);
    });
    const bandWins = inBand.filter(isWon).length;
    const winRate = inBand.length >= 5 ? Math.round((bandWins / inBand.length) * 100) : null;
    return {
      band: def.band,
      min: def.min === -Infinity ? 0 : def.min,
      max: def.max,
      n: inBand.length,
      wins: bandWins,
      winRate,
      // Expected margin = win probability × band-midpoint margin. Same n<5 honesty as winRate.
      expectedValue: winRate != null ? Math.round((winRate / 100) * def.midpoint * 10) / 10 : null,
    };
  });

  const bandsWithMarkup = bands.reduce((s, b) => s + b.n, 0);
  const enoughHistory = decided.length >= 5;

  // Markup advice — ONLY with real sample support. n < 5 anywhere → honest silence.
  let markupAdvice: string | null = null;
  const supportedBands = bands.filter((b) => b.winRate != null);
  if (enoughHistory && supportedBands.length >= 2) {
    const best = [...supportedBands].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
    const worst = [...supportedBands].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0))[0];
    if (best.band !== worst.band && (best.winRate ?? 0) - (worst.winRate ?? 0) >= 15) {
      markupAdvice =
        `Your win rate in the ${best.band} markup band is ${best.winRate}% (${best.wins}/${best.n}) vs ` +
        `${worst.winRate}% (${worst.wins}/${worst.n}) in the ${worst.band} band. Based on this history, ` +
        `bids priced in the ${best.band} band have converted best. This is descriptive, not a guarantee — ` +
        `market, owner, and scope always matter.`;
    }
  }

  // Workflow-efficiency suggestions — each with the WHY.
  const workflowSuggestions: WorkflowSuggestion[] = [];
  let takeoffCount = 0;
  try {
    const { count } = await (db as any)
      .from('takeoffs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    takeoffCount = count ?? 0;
  } catch { takeoffCount = 0; }

  if (bids.length > 0 && takeoffCount === 0) {
    workflowSuggestions.push({
      suggestion: 'You build estimates from scratch — AI Takeoffs feed them in one click.',
      why: 'Upload the plan set and Saguaro produces CSI-organized quantities with pricing in about 90 seconds; estimates grounded in measured quantities are faster to produce and easier to defend in bid leveling than numbers built by hand.',
    });
  }
  if (enoughHistory && won.length / decided.length < 0.15) {
    workflowSuggestions.push({
      suggestion: `Your overall win rate is ${Math.round((won.length / decided.length) * 100)}% across ${decided.length} decided bids — worth a bid/no-bid review.`,
      why: 'Under ~15% suggests estimate time is being spent on bids outside your sweet spot; tightening bid/no-bid criteria (owner relationship, project type fit, bonding, schedule) recovers estimating hours for winnable work.',
    });
  }
  if (enoughHistory && won.length / decided.length > 0.35) {
    workflowSuggestions.push({
      suggestion: `You win ${Math.round((won.length / decided.length) * 100)}% of decided bids — you may be leaving margin on the table.`,
      why: 'Hard-bid win rates above ~35% usually mean pricing below the market-clearing level; testing slightly higher markup on your next comparable bid is a low-risk experiment your history supports.',
    });
  }

  return {
    totalBids: bids.length,
    decidedBids: decided.length,
    wonBids: won.length,
    overallWinRate: enoughHistory ? Math.round((won.length / decided.length) * 100) : null,
    enoughHistory,
    bandsWithMarkup,
    bands,
    markupAdvice,
    workflowSuggestions,
  };
}

/** Prompt section for R17. */
export function buildBidBrainBlock(a: BidBrainAnalysis): string {
  const lines: string[] = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('BID BRAIN — REAL BID HISTORY (SAMPLE-SIZE HONESTY IS MANDATORY)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Total bids on file: ${a.totalBids} | Decided (won or lost): ${a.decidedBids} | Won: ${a.wonBids}`);
  if (!a.enoughHistory) {
    lines.push('');
    lines.push(`NOT ENOUGH HISTORY: only ${a.decidedBids} decided bid(s). If asked about win rates or markup strategy, say plainly: "There isn't enough bid history yet (fewer than 5 decided bids) to say anything statistically honest." NEVER fake confidence, never extrapolate from 1–4 data points as if it were a trend. You may still give general industry markup guidance, clearly labeled as general — not from their data.`);
  } else {
    lines.push(`Overall win rate: ${a.overallWinRate}% of decided bids.`);
    lines.push('Win rate by markup band (bands with n < 5 show "not enough data"; expected margin = win rate × band-midpoint markup, e.g. "at 10–15% markup you win 71% (n=7) — expected margin ~8.9%"):');
    for (const b of a.bands) {
      if (b.n === 0) continue;
      lines.push(
        b.winRate != null
          ? `  • ${b.band} markup: ${b.winRate}% win rate (n=${b.n}, ${b.wins} won)${b.expectedValue != null ? ` — expected margin ~${b.expectedValue}%` : ''}`
          : `  • ${b.band} markup: not enough data (only ${b.n} bid${b.n === 1 ? '' : 's'})`
      );
    }
    if (a.bandsWithMarkup === 0) {
      lines.push('  (No decided bids have a derivable markup % — cost or margin data is missing.)');
    }
    if (a.markupAdvice) {
      lines.push('');
      lines.push(`MARKUP OBSERVATION (sample-supported): ${a.markupAdvice}`);
    }
  }
  if (a.workflowSuggestions.length > 0) {
    lines.push('');
    lines.push('WORKFLOW SUGGESTIONS (offer when relevant — ALWAYS include the why):');
    for (const s of a.workflowSuggestions) {
      lines.push(`  • ${s.suggestion}`);
      lines.push(`    WHY: ${s.why}`);
    }
  }
  lines.push('');
  lines.push('RULES: cite the actual n behind any rate you quote. If n < 5 in a band, say "not enough history yet". Every suggestion must carry its WHY.');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// R18 — CONSENT-FIRST AUTOMATION RULES + ACTIVITY TRAIL
// ─────────────────────────────────────────────────────────────────────────────

export interface SageAutomationRule {
  id: string;
  user_id: string;
  tenant_id: string | null;
  title: string;
  description: string | null;
  trigger_type: string;
  action_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  revoked_at: string | null;
}

export async function loadAutomationRules(userId: string): Promise<SageAutomationRule[]> {
  const db = createServerClient();
  try {
    const { data } = await (db as any)
      .from('sage_automation_rules')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    return (data ?? []) as SageAutomationRule[];
  } catch {
    return [];
  }
}

/** Appends to the Sage activity trail. Tolerant of the table not existing yet. */
export async function logSageActivity(entry: {
  userId: string;
  tenantId: string;
  actionType: string;
  summary: string;
  actor?: 'sage' | 'user';
  ruleId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const db = createServerClient();
  try {
    await must((db as any).from('sage_activity_log').insert({
      user_id: entry.userId,
      tenant_id: entry.tenantId,
      rule_id: entry.ruleId ?? null,
      actor: entry.actor ?? 'sage',
      action_type: entry.actionType,
      summary: entry.summary,
      detail: entry.detail ?? {},
      created_at: new Date().toISOString(),
    }), 'sage_activity_log insert');
  } catch { /* tolerant until migration applied */ }
}

/** Prompt section for R18. */
export function buildAutomationBlock(rules: SageAutomationRule[]): string {
  const lines: string[] = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('EVENT REPORTER + CONSENT-FIRST AUTOMATION (MANDATORY PATTERN)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`When you surface an event from live data (e.g. "Sub X hasn't confirmed Friday",
"RFI #12 is 6 days overdue", "COI for ACME expires next week"), follow this exact pattern:
  1. EXPLAIN — state the event and why it matters, using the real data.
  2. OFFER — offer to draft the email/message/notice that addresses it.
  3. ASK — end with the explicit choice: "Send / Edit / Create rule / Dismiss?"
     and WAIT for their answer. Never act before they choose.

HONESTY ABOUT "SEND": you cannot transmit email or messages yourself. If they
choose Send, deliver the finished draft immediately and say plainly that the
actual sending happens from their email client or the relevant Saguaro module
(e.g. the sub portal invite or messages screen) — hand them exactly what to
paste. Never claim something was sent.

"CREATE RULE": if they choose it, tell them to open Sage settings → Automation
Rules (or offer to summarize the rule they should create there). Rules are
explicit, GC-approved, visible, and revocable — automation NEVER happens
outside one, and every automated action is logged to the Sage activity trail
they can read in Sage settings.`);
  lines.push('');
  if (rules.length === 0) {
    lines.push('ACTIVE APPROVED RULES: none. You have no standing automation authority — every action requires an in-conversation go-ahead.');
  } else {
    lines.push(`ACTIVE APPROVED RULES (${rules.filter((r) => r.enabled).length} enabled of ${rules.length}):`);
    for (const r of rules.slice(0, 10)) {
      lines.push(`  • [${r.enabled ? 'ON' : 'OFF'}] ${r.title} — trigger: ${r.trigger_type}, action: ${r.action_type}${r.description ? ` — ${r.description}` : ''}`);
    }
    lines.push('Act under a rule ONLY when it is enabled and its trigger genuinely matches; mention which rule authorized the action.');
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// R19 — GENERAL ASSISTANT CAPABILITY HONESTY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The current Sage backend has NO web-search capability (plain Anthropic
 * messages calls; the CRM route's tools are local calculators/drafters).
 * This block encodes exactly what Sage can and cannot reach so it never
 * invents availability, prices, or ETAs.
 */
export function buildGeneralAssistantBlock(): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL ASSISTANT DUTIES — CAPABILITY HONESTY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are a first-class general assistant as well as a construction expert. Rules
for the common task families:

TIME & DATE: trivial — answer instantly from the temporal block in this prompt.

PLATFORM DATA LOOKUPS: use the live account/project data injected into this
prompt. If a number isn't in your context, say which Saguaro screen has it —
do not guess values.

PARTS / MATERIAL / WHOLESALER LOOKUPS: you have NO live web access in this
backend. You cannot check today's stock or prices at Home Depot, Ferguson,
White Cap, or anyone else. Say that plainly, then offer what you CAN do: the
in-platform Saguaro catalog has reference-priced items with Verify links the
user can click to confirm current pricing (Catalog page → search the item).
NEVER invent current availability or prices. Historical/typical price ranges
from your training are fine when clearly labeled as reference figures, not
live quotes.

DIRECTIONS: generate a Google Maps deep link in this exact form:
https://www.google.com/maps/dir/?api=1&destination=<URL-encoded address>
(add &origin=<URL-encoded address> when they give a starting point).
Give NO estimated travel times — you cannot know traffic. The link is the
honest deliverable.

DRAFTING, MATH, ADVICE, GENERAL KNOWLEDGE: answer fully and well, per your
conversational rules. Show math step-by-step for any calculation.`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATOR — one tolerant call for chat routes
// ─────────────────────────────────────────────────────────────────────────────

export interface SageBrainSections {
  styleBlock: string | null;
  bidBrainBlock: string | null;
  automationBlock: string | null;
  assistantBlock: string;
}

export async function buildSageBrainSections(
  userId: string,
  tenantId: string
): Promise<SageBrainSections> {
  const [profile, bidBrain, rules] = await Promise.all([
    loadOrComputeStyleProfile(userId, tenantId).catch(() => null),
    loadBidBrain(tenantId).catch(() => null),
    loadAutomationRules(userId).catch(() => [] as SageAutomationRule[]),
  ]);

  return {
    styleBlock: buildStyleBlock(profile),
    bidBrainBlock: bidBrain ? buildBidBrainBlock(bidBrain) : null,
    automationBlock: buildAutomationBlock(rules),
    assistantBlock: buildGeneralAssistantBlock(),
  };
}
