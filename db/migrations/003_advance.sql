-- Advance payment. Run once on an existing database:
--   docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/migrations/003_advance.sql
-- (a fresh database gets all of this from schema.sql)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS advance_percent int NOT NULL DEFAULT 100;
DO $$ BEGIN
  ALTER TABLE properties ADD CONSTRAINT properties_advance_percent_chk CHECK (advance_percent BETWEEN 10 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_amount numeric(10,2);
