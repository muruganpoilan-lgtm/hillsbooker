-- Paying hosts through RazorpayX: status of each payout, and the Razorpay records created for each host.
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'manual';          -- manual (you paid by hand) or razorpayx
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';             -- processing, paid or failed
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS provider_payout_id text;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS destination text;                                -- where the money went, e.g. "UPI name@bank" or "Bank XXXX1234"
DO $$ BEGIN
  ALTER TABLE payouts ADD CONSTRAINT payouts_status_check CHECK (status IN ('processing', 'paid', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS payouts_provider_idx ON payouts (provider_payout_id);

CREATE TABLE IF NOT EXISTS razorpayx_contacts (
  host_id     uuid PRIMARY KEY REFERENCES users(id),
  contact_id  text NOT NULL
);
-- One row per distinct UPI ID or bank account a host has used. Changing details simply makes a new row.
CREATE TABLE IF NOT EXISTS razorpayx_fund_accounts (
  host_id          uuid NOT NULL REFERENCES users(id),
  signature        text NOT NULL,
  fund_account_id  text NOT NULL,
  PRIMARY KEY (host_id, signature)
);
