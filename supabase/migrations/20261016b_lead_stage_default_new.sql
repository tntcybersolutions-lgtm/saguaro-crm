-- lead_pipeline.stage defaulted to 'prospect', a word that is not on the
-- board (lib/lead-stages: New, Contacted, Qualified, Proposal, Negotiation,
-- Won, Lost). Any insert that left stage out landed in no column. The default
-- is now the canonical first stage, and any row still carrying the old word
-- is moved to it.
ALTER TABLE public.lead_pipeline ALTER COLUMN stage SET DEFAULT 'New';
UPDATE public.lead_pipeline SET stage = 'New' WHERE lower(trim(stage)) IN ('prospect', 'prospecting');
