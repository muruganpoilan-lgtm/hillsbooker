-- "Manage my hotel": a free hotel management tool for hosts.
-- Rooms, a guest register (Hill Booker bookings plus walk-in guests), staff, attendance and salary.
-- Every row belongs to one property, and only the account that holds that property can read or change it.

-- One row per real room (Room 101, Cottage 2 ...). A room type says how many rooms there are; this names each one.
CREATE TABLE IF NOT EXISTS hotel_rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES room_types(id) ON DELETE SET NULL,
  label        text NOT NULL,
  status       text NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'cleaning', 'repair')),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_rooms_label_uq ON hotel_rooms (property_id, lower(label));

-- Guests who booked directly with the hotel (walk-in, phone, another site). Hill Booker bookings are not copied here.
CREATE TABLE IF NOT EXISTS hotel_guests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id      uuid REFERENCES hotel_rooms(id) ON DELETE SET NULL,
  name         text NOT NULL,
  phone        text,
  check_in     date NOT NULL,
  check_out    date NOT NULL,
  people       int NOT NULL DEFAULT 1 CHECK (people BETWEEN 1 AND 50),
  total_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount  numeric(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  CHECK (paid_amount <= total_amount)
);
CREATE INDEX IF NOT EXISTS idx_hotel_guests_property ON hotel_guests (property_id, check_in);

-- What the host adds to a Hill Booker booking: the room given and the balance collected at the property.
CREATE TABLE IF NOT EXISTS hotel_booking_extras (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  room_id    uuid REFERENCES hotel_rooms(id) ON DELETE SET NULL,
  collected  numeric(10,2) NOT NULL DEFAULT 0 CHECK (collected >= 0),
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_staff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name           text NOT NULL,
  phone          text,
  job            text,
  joined_on      date,
  left_on        date,
  monthly_salary numeric(10,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  active         boolean NOT NULL DEFAULT true,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_property ON hotel_staff (property_id);

CREATE TABLE IF NOT EXISTS hotel_attendance (
  staff_id uuid NOT NULL REFERENCES hotel_staff(id) ON DELETE CASCADE,
  day      date NOT NULL,
  status   text NOT NULL CHECK (status IN ('present', 'absent', 'half', 'leave')),
  PRIMARY KEY (staff_id, day)
);

-- Money given to a staff member for one salary month: an advance, or salary paid. "month" is the first day of that month.
CREATE TABLE IF NOT EXISTS hotel_salary_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES hotel_staff(id) ON DELETE CASCADE,
  month      date NOT NULL CHECK (extract(day FROM month) = 1),
  kind       text NOT NULL CHECK (kind IN ('salary', 'advance')),
  amount     numeric(10,2) NOT NULL CHECK (amount > 0),
  paid_on    date NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_salary_staff ON hotel_salary_payments (staff_id, month);
