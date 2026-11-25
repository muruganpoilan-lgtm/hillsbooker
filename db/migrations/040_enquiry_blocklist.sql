-- Senders to file as spam on sight, however the enquiry is worded.
-- The spam rules judge each message by its shape; this judges by who sent it, which is
-- what you want once the same advertiser has come back for a third time.
CREATE TABLE IF NOT EXISTS enquiry_blocklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('domain', 'email', 'phone')),
  value      text NOT NULL,   -- always stored lower-case and trimmed; phones digits-only
  note       text,            -- why it was blocked, for whoever reads this in a year
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- 'domain' blocks every address at that domain, which is the useful default: an advertiser
-- who gets no reply from camille@ simply writes again from pierre@.
INSERT INTO enquiry_blocklist (kind, value, note) VALUES
  ('domain', 'touristdock.com', 'Repeat group-tour adverts, Nov 2026')
ON CONFLICT (kind, value) DO NOTHING;
