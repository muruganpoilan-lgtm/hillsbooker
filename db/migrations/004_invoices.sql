-- Invoice numbers. Run once on an existing database:
--   docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/migrations/004_invoices.sql
-- (a fresh database gets all of this from schema.sql)
CREATE SEQUENCE IF NOT EXISTS invoice_seq;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_no text;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_invoice_no_uq ON bookings (invoice_no) WHERE invoice_no IS NOT NULL;
