-- Trip packages: ready-made trips made by Hill Booker (for example "3 nights in Munnar for a couple").
-- Guests browse them and send an enquiry; the team calls with the final price. Handled by hand, like group tours.
CREATE TABLE IF NOT EXISTS packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  destination      text NOT NULL,
  nights           integer NOT NULL CHECK (nights >= 0 AND nights <= 30),
  days             integer NOT NULL CHECK (days >= 1 AND days <= 31),
  price_per_person numeric(10,2) NOT NULL CHECK (price_per_person >= 0),
  min_people       integer NOT NULL DEFAULT 2 CHECK (min_people >= 1),
  summary          text,
  itinerary        text,
  includes         text,
  excludes         text,
  active           boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_photos (
  id          serial PRIMARY KEY,
  package_id  uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS package_photos_idx ON package_photos (package_id, position);

-- Package enquiries go into the same list as group and corporate enquiries.
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_kind_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_kind_check CHECK (kind IN ('group', 'corporate', 'package'));
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;
