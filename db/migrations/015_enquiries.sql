-- Group tour and corporate tour enquiries from the website. Handled by hand by the admin.
CREATE TABLE IF NOT EXISTS enquiries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('group', 'corporate')),
  name        text NOT NULL,
  company     text,
  phone       text NOT NULL,
  email       text,
  destination text,
  start_date  date,
  people      integer,
  budget      text,
  notes       text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries (created_at DESC);
