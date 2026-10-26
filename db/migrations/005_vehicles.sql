-- Travel vehicles: operators list cars, vans and buses; guests book by the day or a fixed trip.
-- Run once on an existing database:
--   docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/migrations/005_vehicles.sql
-- (a fresh database gets all of this from schema.sql)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('guest', 'owner', 'operator', 'admin'));

CREATE TABLE IF NOT EXISTS vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id   uuid NOT NULL REFERENCES users(id),
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('car', 'suv', 'van', 'traveller', 'mini_bus', 'bus')),
  seats         int NOT NULL CHECK (seats BETWEEN 1 AND 80),
  ac            boolean NOT NULL DEFAULT true,
  city          text NOT NULL,                       -- where the vehicle is based
  description   text,
  price_per_day numeric(10,2) NOT NULL CHECK (price_per_day >= 0),
  km_per_day    int CHECK (km_per_day > 0),          -- kilometres included per day; NULL = unlimited
  extra_km_rate numeric(8,2) CHECK (extra_km_rate >= 0),
  quantity      int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 50),  -- identical vehicles the operator has
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  advance_percent int NOT NULL DEFAULT 100 CHECK (advance_percent BETWEEN 10 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_city ON vehicles (lower(city));

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id          serial PRIMARY KEY,
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos ON vehicle_photos (vehicle_id, position);

-- A fixed-price trip, e.g. "Munnar sightseeing, one day" for a set price.
CREATE TABLE IF NOT EXISTS vehicle_trips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  from_place  text,
  to_place    text,
  details     text,
  price       numeric(10,2) NOT NULL CHECK (price >= 0),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips ON vehicle_trips (vehicle_id);

-- start_date..end_date are both days of use (a one-day trip has the same date twice).
CREATE TABLE IF NOT EXISTS vehicle_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id),
  trip_id         uuid REFERENCES vehicle_trips(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  count           int NOT NULL DEFAULT 1 CHECK (count >= 1),
  passengers      int NOT NULL DEFAULT 1 CHECK (passengers >= 1),
  pickup          text,
  note            text,
  total_amount    numeric(10,2) NOT NULL,
  advance_amount  numeric(10,2) NOT NULL,
  status          text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_vbookings_vehicle ON vehicle_bookings (vehicle_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_vbookings_user ON vehicle_bookings (user_id, created_at DESC);

-- A payment now belongs to either a room booking or a vehicle booking.
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS vehicle_booking_id uuid REFERENCES vehicle_bookings(id);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_one_target;
ALTER TABLE payments ADD CONSTRAINT payments_one_target CHECK (num_nonnulls(booking_id, vehicle_booking_id) = 1);
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_vehicle ON payments (vehicle_booking_id) WHERE status = 'created';
