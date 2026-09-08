-- Area breakdown on schedule tasks, so a long activity can be split into
-- places that sequence finish-to-start.
--
-- The problem being solved. A task that covers the whole building -- "Structural
-- Steel Erection, 55 working days" -- necessarily overlaps every other
-- whole-building task, so the only logic that can be written between them is
-- start-to-start with a large lag. On the demo project that produced 87.5% of
-- relationships carrying a lag against a DCMA threshold of 5%, and 19%
-- finish-to-start against a threshold of 90%. Those are not three findings,
-- they are one: the task list is too coarse to carry logic.
--
-- A 55-day task also cannot be tracked. "How is the steel going" has no answer
-- more precise than "about half", because half of the steel is not a place.
--
-- Splitting it into Zone A / B / C gives every piece a place somebody can walk,
-- a finish-to-start relationship to the piece before it, and -- where the trade
-- in front is split into the same zones -- a takt link so the deck crew follows
-- the steel crew one zone behind instead of waiting for all of it.

alter table public.schedule_tasks
  add column if not exists area text;

alter table public.schedule_tasks
  add column if not exists area_index integer;

-- The task this one was split out of. Kept so a split stays traceable and can
-- be merged back: a split is a judgement about the job, and judgements get
-- reversed. Without the parent link, accepting a proposal is a one-way door.
--
-- Deliberately NOT a foreign key. Splitting replaces the original: the pieces
-- are the real work and the parent row is removed, or the assessment counts 55
-- days of steel twice, once whole and once in zones. A reference carrying
-- ON DELETE SET NULL would wipe this column at exactly that moment -- the merge
-- reconstructs from the pieces and never reads the parent row, so all this has
-- to do is remember an id that no longer exists.
alter table public.schedule_tasks
  add column if not exists parent_task_id uuid;

create index if not exists schedule_tasks_parent_task_id_idx
  on public.schedule_tasks (parent_task_id) where parent_task_id is not null;

create index if not exists schedule_tasks_project_area_idx
  on public.schedule_tasks (project_id, area) where area is not null;

comment on column public.schedule_tasks.area is
  'The place this task covers -- "Zone A", "Level 2". Null means the task covers the whole job.';
comment on column public.schedule_tasks.area_index is
  'Order of this area within its parent split, so the pieces sequence in the order the crew walks them.';
comment on column public.schedule_tasks.parent_task_id is
  'The whole-job task this piece was split out of. Deliberately not a foreign key: the parent row is removed when a split is applied, and this has to outlive it so the split can be reversed.';
