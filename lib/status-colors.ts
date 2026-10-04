/**
 * The one status-color system for the whole app.
 *
 * The owner's mandate: a GC must read an item's status by COLOUR alone as it
 * scrolls across the ticker. These six are fixed and never change meaning:
 *
 *   OVERDUE         red     — anything late / past due / needs action now
 *   LEADS           blue    — a lead / opportunity / deal in the pipeline
 *   UNDER CONTRACT  amber   — awarded / under contract / bidding won, pre-build
 *   ONGOING         green   — active / in progress on site
 *   COMPLETED       orange  — finished / substantially complete
 *   CLOSED          grey    — closed / cancelled / archived / lost
 *
 * This is a leaf module — no imports, safe in both server (suggestion engine)
 * and client (ticker, badges). Everything that colors by status reads HERE so
 * the colors can never drift apart across screens.
 */

export type StatusKind =
  | 'overdue'
  | 'lead'
  | 'under_contract'
  | 'ongoing'
  | 'completed'
  | 'closed';

export interface StatusStyle {
  kind: StatusKind;
  /** Title Case display label for a ticker chip / badge (COPY-STYLE §1). */
  label: string;
  /** The indicator color — the one the GC reads at a glance. */
  color: string;
  /** Translucent fill + border tuned to the dark surface. */
  bg: string;
  border: string;
}

/* One bright, clean neon-on-black family (owner decision 2026-10-02 — jet
   black + glass + neon yellow, uniform end to end). Same saturation and
   lightness band for all six so no status shouts over another; fills are
   ~16% and borders ~50% of the hue so a pill reads on glass and on black.
   Job-grade traffic-light semantics (Procore/Fieldwire/Buildertrend convention):
   red = late, orange = bidding/at risk, yellow = under contract, green = active/done, grey = closed.
   Mirrored as --status-* in app/globals.css. */
export const STATUS_COLORS: Record<StatusKind, StatusStyle> = {
  overdue:        { kind: 'overdue',        label: 'Overdue',        color: '#FF3B30', bg: 'rgba(255,59,48,0.16)',   border: 'rgba(255,59,48,0.50)' },
  lead:           { kind: 'lead',           label: 'Lead',           color: '#FF8A00', bg: 'rgba(255,138,0,0.16)',  border: 'rgba(255,138,0,0.50)' },
  under_contract: { kind: 'under_contract', label: 'Under Contract', color: '#FFE600', bg: 'rgba(255,230,0,0.16)',  border: 'rgba(255,230,0,0.50)' },
  ongoing:        { kind: 'ongoing',        label: 'Ongoing',        color: '#2CFF7A', bg: 'rgba(44,255,122,0.16)',  border: 'rgba(44,255,122,0.50)' },
  completed:      { kind: 'completed',      label: 'Completed',      color: '#2CFF7A', bg: 'rgba(44,255,122,0.10)', border: 'rgba(44,255,122,0.35)' },
  closed:         { kind: 'closed',         label: 'Closed',         color: '#A3ACBB', bg: 'rgba(163,172,187,0.16)', border: 'rgba(163,172,187,0.45)' },
};

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

/* Raw project.status / lead.stage spellings mapped to a kind. Kept generous
   because the live data carries mixed casing and legacy values. */
const UNDER_CONTRACT = new Set(['under_contract', 'under contract', 'awarded', 'won', 'contracted', 'signed', 'pre-construction', 'preconstruction', 'buyout']);
const ONGOING        = new Set(['active', 'in_progress', 'in progress', 'ongoing', 'building', 'construction', 'started', 'open']);
const COMPLETED      = new Set(['completed', 'complete', 'substantially_complete', 'substantial completion', 'finished', 'done', 'closeout']);
const CLOSED         = new Set(['closed', 'cancelled', 'canceled', 'archived', 'lost', 'dead', 'inactive']);
const LEAD_STAGES    = new Set(['lead', 'leads', 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'opportunity', 'prospect', 'bidding', 'bid']);

/** Map a raw project status / lifecycle string to a status kind. */
export function statusKindForProject(rawStatus: unknown): StatusKind {
  const s = norm(rawStatus);
  if (!s) return 'ongoing';
  if (CLOSED.has(s)) return 'closed';
  if (COMPLETED.has(s)) return 'completed';
  if (UNDER_CONTRACT.has(s)) return 'under_contract';
  if (ONGOING.has(s)) return 'ongoing';
  if (LEAD_STAGES.has(s)) return 'lead';
  return 'ongoing';
}

/** Describes one thing that can scroll on the ticker. */
export interface TickerClassInput {
  /** The item's domain: 'lead' | 'project' | 'overdue' | 'task' | 'payapp' | … */
  type?: string | null;
  /** The related project/lead status, when there is one. */
  status?: string | null;
  /** True when the item is late / past due — this ALWAYS wins (red). */
  overdue?: boolean | null;
}

/**
 * The single rule the ticker uses to color an item. Overdue always wins
 * (a late invoice on an active job is red, not green), then leads, then the
 * project lifecycle.
 */
export function statusKindForItem(input: TickerClassInput): StatusKind {
  if (input.overdue) return 'overdue';
  const t = norm(input.type);
  if (t === 'overdue' || t === 'late' || t === 'past_due' || t === 'alert') return 'overdue';
  if (t === 'lead' || t === 'deal' || t === 'opportunity') return 'lead';
  if (input.status != null && input.status !== '') return statusKindForProject(input.status);
  if (LEAD_STAGES.has(t)) return 'lead';
  return 'ongoing';
}

export function statusStyle(kind: StatusKind): StatusStyle {
  return STATUS_COLORS[kind];
}
