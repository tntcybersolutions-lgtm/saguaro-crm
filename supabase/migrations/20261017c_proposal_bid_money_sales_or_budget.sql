-- Proposal and bid dollars, and e-sign signer details: Sales OR Budget.
--
-- Owner decision (16 Oct 2026): proposal amounts, line items and totals, the
-- bids received on a package, and the e-signature records (signer names,
-- emails, IP addresses, user agents) are visible only to a role with Sales or
-- Budget permission. Until now proposals / proposal_lines followed Documents
-- (so a Subcontractor read proposal amounts), bids / bid_submissions followed
-- Projects (so every field role read every sub's number), and
-- proposal_signatures / proposal_signature_events had no role gate at all.
--
-- The server applies the same rule (PROPOSAL_MONEY in lib/permissions:
-- guardProposal, /api/proposals/*, /api/projects/[id]/proposals, bid leveling,
-- award, bids list, the bid-package detail and list). The public signing portal
-- (/api/portals/proposal/[token]) uses the service role and is unaffected.
--
-- ALTER POLICY keeps each existing role_gate_* policy (RESTRICTIVE, TO
-- authenticated) and changes only its expression; nothing is dropped.

-- proposals + proposal_lines: Sales or Budget at the matching level.
ALTER POLICY role_gate_sel_proposals ON public.proposals
  USING ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View')));
ALTER POLICY role_gate_ins_proposals ON public.proposals
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_upd_proposals ON public.proposals
  USING ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')))
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_del_proposals ON public.proposals
  USING ((SELECT rbac.has_permission('Sales', 'Full')) OR (SELECT rbac.has_permission('Budget', 'Full')));

ALTER POLICY role_gate_sel_proposal_lines ON public.proposal_lines
  USING ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View')));
ALTER POLICY role_gate_ins_proposal_lines ON public.proposal_lines
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_upd_proposal_lines ON public.proposal_lines
  USING ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')))
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_del_proposal_lines ON public.proposal_lines
  USING ((SELECT rbac.has_permission('Sales', 'Full')) OR (SELECT rbac.has_permission('Budget', 'Full')));

-- bids (the company's own bids): Sales or Budget.
ALTER POLICY role_gate_sel_bids ON public.bids
  USING ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View')));
ALTER POLICY role_gate_ins_bids ON public.bids
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_upd_bids ON public.bids
  USING ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')))
  WITH CHECK ((SELECT rbac.has_permission('Sales', 'Edit')) OR (SELECT rbac.has_permission('Budget', 'Edit')));
ALTER POLICY role_gate_del_bids ON public.bids
  USING ((SELECT rbac.has_permission('Sales', 'Full')) OR (SELECT rbac.has_permission('Budget', 'Full')));

-- bid_submissions (subs' bids on a package): still a Projects tool, and the
-- amounts need Sales or Budget on top. Writes keep their Projects gate; an
-- update also needs the row to be visible, so it inherits the money rule.
ALTER POLICY role_gate_sel_bid_submissions ON public.bid_submissions
  USING ((SELECT rbac.has_permission('Projects', 'View'))
         AND ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View'))));

-- proposal_signatures + proposal_signature_events: read-only to the browser
-- (writes are service-role only); Sales or Budget to read.
DO $gate$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signatures' AND policyname = 'role_gate_sel_proposal_signatures') THEN
    CREATE POLICY role_gate_sel_proposal_signatures ON public.proposal_signatures
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposal_signature_events' AND policyname = 'role_gate_sel_proposal_signature_events') THEN
    CREATE POLICY role_gate_sel_proposal_signature_events ON public.proposal_signature_events
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING ((SELECT rbac.has_permission('Sales', 'View')) OR (SELECT rbac.has_permission('Budget', 'View')));
  END IF;
END
$gate$;
