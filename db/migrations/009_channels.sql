-- Channel manager: calendar (iCal) sync with other booking sites.
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS ical_token text UNIQUE;

-- A calendar link the host pasted in from another site (Airbnb, Booking.com, ...). We read it every 15 minutes.
CREATE TABLE IF NOT EXISTS room_feeds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id   uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  name           text NOT NULL,
  url            text NOT NULL,
  last_synced_at timestamptz,
  last_status    text,
  last_error     text,
  events         int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_feeds_room ON room_feeds (room_type_id);

-- Nights that other sites have taken. wanted = rooms they ask us to block; applied = rooms actually removed
-- from room_inventory (never more than were free), so removing a block gives back exactly what it took.
CREATE TABLE IF NOT EXISTS external_nights (
  feed_id      uuid NOT NULL REFERENCES room_feeds(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  day          date NOT NULL,
  wanted       int NOT NULL CHECK (wanted > 0),
  applied      int NOT NULL CHECK (applied >= 0),
  PRIMARY KEY (feed_id, day)
);
CREATE INDEX IF NOT EXISTS idx_external_nights_room ON external_nights (room_type_id, day);
