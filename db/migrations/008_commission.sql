-- Hill Booker's commission on each paid advance, saved when the payment is received (so a later rate change never rewrites history).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS commission numeric(10,2) NOT NULL DEFAULT 0;
