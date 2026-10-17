/**
 * lib/hidden-projects.ts — kept so older imports resolve. The one rule for
 * which jobs show up lives in lib/live-jobs.ts; import from there.
 */
export { isHiddenJob as isHiddenProject, hiddenJobIds as hiddenProjectIds } from '@/lib/live-jobs';
