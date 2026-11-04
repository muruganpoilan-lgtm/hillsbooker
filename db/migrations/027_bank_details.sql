-- Optional bank account for host payouts (alongside the UPI ID).
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_holder  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_ifsc    text;
