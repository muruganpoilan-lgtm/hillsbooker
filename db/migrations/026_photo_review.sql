-- Photos uploaded by hosts wait for the admin's approval before guests can see them.
-- Photos that exist today stay visible (their status starts as 'approved').
ALTER TABLE property_photos  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE property_photos  ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE room_type_photos ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE room_type_photos ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE vehicle_photos   ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE vehicle_photos   ADD COLUMN IF NOT EXISTS reject_reason text;
CREATE INDEX IF NOT EXISTS property_photos_pending_idx  ON property_photos (status)  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS room_type_photos_pending_idx ON room_type_photos (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS vehicle_photos_pending_idx   ON vehicle_photos (status)   WHERE status = 'pending';
