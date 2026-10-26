-- Direct UPI: a host can save a UPI ID; guests may pay the advance straight to it and the host confirms.
ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_id text;
