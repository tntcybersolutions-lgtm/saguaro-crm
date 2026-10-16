-- projects.billed_to_date counted only pay applications in 'submitted' or
-- 'certified'. An application moves on to 'approved' and 'paid', and the
-- moment it did, it fell out of the figure: Pima County Adult Detention
-- Center has five applications, all paid, $2,539,650 completed to date —
-- and billed_to_date read $0. The owner's portal reads this column.
--
-- Billed to date is G702 line 4 (total completed and stored to date, already
-- cumulative) on the latest application that has gone to the owner: every
-- status from 'submitted' on. Drafts have billed nobody; a soft-deleted
-- application is not on the job. MAX of a cumulative column — never a SUM.
--
-- The update only fires when the figure actually changes, so a pay-app save
-- that does not move it writes no history row on the project.

CREATE OR REPLACE FUNCTION public.recompute_project_billed(p_project uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.projects p set billed_to_date = v.billed
  from (
    select coalesce(max(total_completed_stored), 0) as billed
    from public.pay_applications
    where project_id = p_project
      and deleted_at is null
      and status in ('submitted', 'under_review', 'in_review', 'approved', 'certified', 'paid')
  ) v
  where p.id = p_project
    and p.billed_to_date is distinct from v.billed;
$function$;

-- Backfill. Applied 2026-10-16 for tenant 692d8793 (Saguaro Control
-- Systems) only; every other job recomputes on its next pay-app write, or run
-- this without the tenant filter to settle them all at once:
SELECT public.recompute_project_billed(pid)
FROM (SELECT DISTINCT project_id AS pid FROM public.pay_applications
      WHERE project_id IS NOT NULL
        AND tenant_id = '692d8793-4d9f-4c43-a935-bf56cc637553') s;
