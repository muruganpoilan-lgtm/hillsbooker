-- Guests are now entered as adults + children. bookings.guests stays the total (used for room capacity);
-- children is how many of them are children, so adults = guests - children.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS children int NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_children_check') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_children_check CHECK (children >= 0 AND children < guests);
  END IF;
END $$;
