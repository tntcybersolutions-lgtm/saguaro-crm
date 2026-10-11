/**
 * lib/schedule-baseline.ts — slip against the schedule the job started with.
 *
 * "Set Baseline" (POST /api/projects/[projectId]/schedule/baseline) copies
 * every task's start/end into baseline_start/baseline_end. From then on the
 * Gantt draws the baseline under each bar and says how many days a task, and
 * the job's finish, have moved. Calendar days, counted on 'YYYY-MM-DD' strings
 * as UTC days so no time zone can shift them. Pure.
 */
type Task = { start_date?: string | null; end_date?: string | null; baseline_start?: string | null; baseline_end?: string | null; status?: string | null };

const day = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const diff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Days the task's finish moved vs its baseline: + late, − early, null = no baseline. */
export function finishVariance(t: Task): number | null {
  const end = day(t.end_date), base = day(t.baseline_end);
  return end && base ? diff(end, base) : null;
}

/** The whole schedule against its baseline. */
export function baselineSummary(tasks: Task[]) {
  const based = tasks.filter((t) => day(t.baseline_end) && day(t.end_date));
  const late = based.filter((t) => (finishVariance(t) || 0) > 0).length;
  const ends = tasks.map((t) => day(t.end_date)).filter((d): d is string => !!d).sort();
  const baseEnds = based.map((t) => day(t.baseline_end)!).sort();
  const finish = ends.length && baseEnds.length ? diff(ends[ends.length - 1], baseEnds[baseEnds.length - 1]) : null;
  return { baselined: based.length, late, finishVariance: finish };
}

/** "+3d" / "−2d" / "on plan". */
export const varianceLabel = (d: number | null) => (d === null ? '' : d === 0 ? 'on plan' : d > 0 ? `+${d}d` : `−${Math.abs(d)}d`);
