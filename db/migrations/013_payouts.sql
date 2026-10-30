-- Record of what Hill Booker has paid out to hosts. One payout covers many payments; each payment is paid out at most once.
CREATE TABLE IF NOT EXISTS payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     uuid NOT NULL REFERENCES users(id),
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  upi_id      text,
  reference   text NOT NULL,            -- the UPI reference (UTR) of the transfer
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS payouts_host_idx ON payouts (host_id, paid_at DESC);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES payouts(id);
CREATE INDEX IF NOT EXISTS payments_payout_idx ON payments (payout_id);
