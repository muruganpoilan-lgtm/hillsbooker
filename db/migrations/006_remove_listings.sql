-- Lets a listing be hidden ("removed") when it already has booking history, so records stay intact.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'c' AND conrelid IN ('properties'::regclass, 'vehicles'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
  ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK (status IN ('pending','approved','rejected','removed'));
  ALTER TABLE vehicles   ADD CONSTRAINT vehicles_status_check   CHECK (status IN ('pending','approved','rejected','removed'));
END $$;

-- Removed listings stay on the server for 30 days (so they can be restored), then a nightly job deletes them.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE vehicles   ADD COLUMN IF NOT EXISTS removed_at timestamptz;
