/**
 * Job picker — how a job is filed and summarised in the header picker
 * (components/HeaderProjectPicker.tsx). Pure, so the grouping and figures are
 * pinned by lib/job-picker.sanity.test.ts.
 */
import { isClosedStatus } from './project-lifecycle';

/** Where a job sits in the picker: by where it is in its life, not A–Z. */
export type PickerSection = 'bidding' | 'building' | 'closeout' | 'closed';

export const PICKER_SECTIONS: PickerSection[] = ['bidding', 'building', 'closeout', 'closed'];

export const SECTION_LABEL: Record<PickerSection, string> = {
  bidding: 'Bidding',
  building: 'Building',
  closeout: 'Closeout',
  closed: 'Closed',
};

const CLOSEOUT_PHASES = ['closeout', 'close_out', 'post_construction', 'warranty'];
const BUILDING_PHASES = ['building', 'construction', 'course_of_construction', 'active', 'execution'];

/**
 * A closed status wins over any phase (a finished job filed under "Building"
 * would be a lie). Otherwise the phase decides; preconstruction and anything
 * unrecognised count as Bidding, matching lib/project-phase normalisePhase.
 */
export function pickerSection(p: { status?: string | null; phase?: string | null }): PickerSection {
  if (isClosedStatus(p.status)) return 'closed';
  const s = String(p.phase ?? '').toLowerCase().trim();
  if (CLOSEOUT_PHASES.includes(s)) return 'closeout';
  if (BUILDING_PHASES.includes(s)) return 'building';
  return 'bidding';
}

type Money = number | string | null | undefined;

/** The job's contract value — revised first, as every other screen reads it. */
export function contractOf(p: { revised_contract_value?: Money; contract_amount?: Money; contract_value?: Money }): number | null {
  const v = Number(p.revised_contract_value || p.contract_amount || p.contract_value || 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Percent complete, 1–100. Zero and blank both mean "nothing recorded" —
 *  a row of empty bars on jobs still being bid says nothing. */
export function progressOf(p: { percent_complete?: Money }): number | null {
  if (p.percent_complete == null || p.percent_complete === '') return null;
  const n = Number(p.percent_complete);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n));
}
