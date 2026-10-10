-- bid_packages.insurance_required_amount defaulted to 1000000, so every package
-- carried a "$1,000,000 minimum coverage" that no GC entered, and the jacket's
-- Insurance & Bonding divider could never read as empty. New packages get NULL
-- until a GC sets a figure. Existing rows are left exactly as they are: the
-- jacket reader (lib/bid-jacket deriveRequirements) already ignores the old
-- default when it stands alone.
--
-- Additive and idempotent: dropping a default that is already gone is a no-op.
ALTER TABLE public.bid_packages ALTER COLUMN insurance_required_amount DROP DEFAULT;
