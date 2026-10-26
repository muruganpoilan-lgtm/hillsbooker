CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'owner', 'operator', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES users(id),
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('hotel', 'homestay', 'apartment', 'resort')),
  description  text,
  city         text NOT NULL,
  address      text,
  lat          numeric(9,6),
  lng          numeric(9,6),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  advance_percent int NOT NULL DEFAULT 100 CHECK (advance_percent BETWEEN 10 AND 100),  -- share of the stay paid online at booking
  rating_avg   numeric(2,1) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_city ON properties (lower(city));

CREATE TABLE amenities (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE property_amenities (
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  amenity_id  int REFERENCES amenities(id),
  PRIMARY KEY (property_id, amenity_id)
);

CREATE TABLE property_photos (
  id          serial PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,  -- file path inside the upload store; NULL for external URLs
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  max_guests  int NOT NULL DEFAULT 2,
  base_price  numeric(10,2) NOT NULL CHECK (base_price >= 0),
  total_rooms int NOT NULL CHECK (total_rooms > 0)
);

CREATE TABLE room_type_photos (
  id           serial PRIMARY KEY,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  url          text NOT NULL,
  storage_key  text,
  position     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_type_photos ON room_type_photos (room_type_id, position);

-- One row per room type per night. This is what prevents double-booking.
CREATE TABLE room_inventory (
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  day          date NOT NULL,
  available    int NOT NULL CHECK (available >= 0),
  price        numeric(10,2),
  PRIMARY KEY (room_type_id, day)
);

CREATE SEQUENCE invoice_seq;

CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  property_id     uuid NOT NULL REFERENCES properties(id),
  room_type_id    uuid NOT NULL REFERENCES room_types(id),
  check_in        date NOT NULL,
  check_out       date NOT NULL,
  rooms           int NOT NULL CHECK (rooms > 0),
  guests          int NOT NULL CHECK (guests > 0),
  total_amount    numeric(10,2) NOT NULL,
  invoice_no      text UNIQUE,  -- assigned the first time an invoice is made, e.g. HB-2026-000123
  advance_amount  numeric(10,2),  -- paid online at booking; the rest is paid at the property. NULL = the full amount
  status          text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_bookings_hold ON bookings (status, hold_expires_at);

CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid REFERENCES bookings(id),
  vehicle_booking_id  uuid,
  provider            text NOT NULL DEFAULT 'razorpay',
  provider_order_id   text,
  provider_payment_id text,
  amount              numeric(10,2) NOT NULL,
  status              text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  refund_id           text,
  refunded_amount     numeric(10,2) NOT NULL DEFAULT 0,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- A Razorpay order belongs to one payment row, and a booking has at most one open (unpaid) order.
CREATE UNIQUE INDEX payments_order_uq ON payments (provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX payments_one_open ON payments (booking_id) WHERE status = 'created';


-- ---------- travel vehicles ----------
CREATE TABLE vehicles (
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
CREATE INDEX idx_vehicles_city ON vehicles (lower(city));

CREATE TABLE vehicle_photos (
  id          serial PRIMARY KEY,
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_photos ON vehicle_photos (vehicle_id, position);

-- A fixed-price trip, e.g. "Munnar sightseeing, one day" for a set price.
CREATE TABLE vehicle_trips (
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
CREATE INDEX idx_vehicle_trips ON vehicle_trips (vehicle_id);

-- start_date..end_date are both days of use (a one-day trip has the same date twice).
CREATE TABLE vehicle_bookings (
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
CREATE INDEX idx_vbookings_vehicle ON vehicle_bookings (vehicle_id, start_date, end_date);
CREATE INDEX idx_vbookings_user ON vehicle_bookings (user_id, created_at DESC);


ALTER TABLE payments ADD CONSTRAINT payments_vehicle_fk FOREIGN KEY (vehicle_booking_id) REFERENCES vehicle_bookings(id);
ALTER TABLE payments ADD CONSTRAINT payments_one_target CHECK (num_nonnulls(booking_id, vehicle_booking_id) = 1);
CREATE UNIQUE INDEX payments_one_open_vehicle ON payments (vehicle_booking_id) WHERE status = 'created';

CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL UNIQUE REFERENCES bookings(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO amenities (name) VALUES
  ('Wi-Fi'), ('Air conditioning'), ('Parking'), ('Breakfast'), ('Swimming pool'),
  ('Kitchen'), ('TV'), ('Hot water'), ('Power backup'), ('Pets allowed');
