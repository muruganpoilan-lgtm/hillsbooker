-- Booking notice: guests cannot book a stay that starts too soon (default: not today, not tomorrow).
-- This protects hosts from double bookings while other sites are still refreshing their calendars.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS min_notice_days int NOT NULL DEFAULT 2;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_min_notice_days_check') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_min_notice_days_check CHECK (min_notice_days BETWEEN 0 AND 14);
  END IF;
END $$;
