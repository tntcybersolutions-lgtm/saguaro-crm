-- An undecided selection must be NULL, not 0.
--
-- `selections.variance` and `selections.selected_amount` both defaulted to 0.
-- That is the root cause of the bug the selections work started from: every row
-- was born claiming a decision had been made, at a price of nothing, exactly on
-- budget. The stored variance then read 0 forever because nothing recomputed it
-- — including the row sitting $2,500 over its allowance.
--
-- The distinction the defaults destroyed is the one the whole log turns on:
--
--   selected_amount NULL  nobody has chosen yet        -> pending, no variance
--   selected_amount 0     chosen, and it costs nothing -> a real decision
--
-- Collapsing those makes an untouched allowance look settled and a project look
-- massively under budget for having open questions.
--
-- Dropping a default changes no existing row; it only stops new inserts from
-- inventing a decision nobody made. `allowance` keeps its 0 default — no
-- allowance and a zero allowance mean the same thing there.

alter table public.selections alter column variance drop default;
alter table public.selections alter column selected_amount drop default;

comment on column public.selections.selected_amount is
  'What was chosen. NULL means no decision yet; 0 means a decision that costs nothing.';
comment on column public.selections.variance is
  'allowance - selected_amount, NULL while undecided. Derived in lib/selections.ts; this column is a cache kept in step by /api/selections/recompute.';
