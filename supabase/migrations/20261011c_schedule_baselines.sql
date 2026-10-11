-- Schedule baselines: "Set Baseline" snapshots each task's dates so the Gantt
-- can show slip against the plan the job started with.
alter table public.schedule_tasks
  add column if not exists baseline_start date,
  add column if not exists baseline_end date;
alter table public.projects
  add column if not exists schedule_baselined_at timestamptz;
