-- A booked inspection is not a passed one.
-- `result` defaulted to 'pass' and `inspected_at` to now(), so any row inserted
-- without them (the auto-built QC checkpoints) was saved as passed, held today.
-- Defaults only; existing rows are left as they are (lib/inspection-result.ts
-- reads a booked row's 'pass' as pending).
alter table public.inspections alter column result set default 'pending';
alter table public.inspections alter column inspected_at drop default;
