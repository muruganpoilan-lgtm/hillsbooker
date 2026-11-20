-- The admin can take down a review (abuse, spam, phone numbers). It is hidden, not deleted, so the same stay
-- can't simply be reviewed again, and a mistake can be undone with Restore.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS removed_reason text;
