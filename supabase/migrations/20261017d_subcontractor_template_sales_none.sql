-- HELD FOR CHAD'S YES — committed, NOT applied.
--
-- The built-in Subcontractor template in the 3 oldest tenants (Saguaro among
-- them) was stored before the Sales category existed, so it has no Sales key
-- and inherits Sales from Projects (View) — INHERITS_WHEN_ABSENT. Sales: View
-- opens proposal and bid dollars and e-sign signer details (20261017c), so a
-- Subcontractor in those tenants still reads them. Every newer tenant's
-- Subcontractor row already says Sales: None, as lib/default-roles seeds it.
--
-- This writes the template's own answer into the 3 old rows. No user holds the
-- role today. It was left out of 20261017b because that run was cleared to
-- change only the Foreman and Superintendent templates.
-- Proven in the rolled-back proof of 20261017b/c: with this line a Subcontractor
-- sees 0 proposals, lines, signatures, events, bids and sub bids (was 2/1/1/1/1/16).

UPDATE public.role_definitions
   SET permissions = permissions || '{"Sales": "None"}'::jsonb
 WHERE is_builtin
   AND name = 'Subcontractor'
   AND NOT (permissions ? 'Sales');
