-- Schedule composer fields that had nowhere to go: "Assigned To" and "Notes"
-- were sent on every task save and the routes dropped them (schedule_tasks had
-- no such columns), so the assignee shown on the Gantt row, the list and the
-- task panel was always blank.
--
-- Additive only: two nullable text columns.

ALTER TABLE public.schedule_tasks ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE public.schedule_tasks ADD COLUMN IF NOT EXISTS notes text;
