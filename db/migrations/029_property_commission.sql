-- Commission per property. Empty = the normal COMMISSION_PERCENT. commission_until = last day (India time) the special rate applies.
-- Deepavali 2026 offer: properties listed from 7 to 30 November 2026 pay 5% on bookings made up to 28 February 2027.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) CHECK (commission_percent BETWEEN 0 AND 100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS commission_until date;

CREATE OR REPLACE FUNCTION deepavali_2026_offer() RETURNS trigger AS $$
BEGIN
  IF NEW.commission_percent IS NULL
     AND (now() AT TIME ZONE 'Asia/Kolkata')::date BETWEEN DATE '2026-11-07' AND DATE '2026-11-30' THEN
    NEW.commission_percent := 5;
    NEW.commission_until := DATE '2027-02-28';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deepavali_2026_offer ON properties;
CREATE TRIGGER deepavali_2026_offer BEFORE INSERT ON properties FOR EACH ROW EXECUTE FUNCTION deepavali_2026_offer();
