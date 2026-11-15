-- Manage my hotel, part 3: extras on the room bill (food, laundry, travel), expenses with supplier dues, and stock.

-- The hotel's price list for extras: tea, breakfast, laundry per piece, airport drop ...
CREATE TABLE IF NOT EXISTS hotel_menu_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'food' CHECK (category IN ('food', 'laundry', 'travel', 'other')),
  price       numeric(10,2) NOT NULL CHECK (price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_menu_property ON hotel_menu_items (property_id);

-- One extra posted to a guest's bill. It belongs to a walk-in guest or to a Hill Booker booking.
CREATE TABLE IF NOT EXISTS hotel_charges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_id    uuid REFERENCES hotel_guests(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'food' CHECK (category IN ('food', 'laundry', 'travel', 'other')),
  qty         int NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 999),
  unit_price  numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  amount      numeric(10,2) NOT NULL CHECK (amount >= 0),
  charged_on  date NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(guest_id, booking_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_hotel_charges_guest ON hotel_charges (guest_id);
CREATE INDEX IF NOT EXISTS idx_hotel_charges_booking ON hotel_charges (booking_id);
CREATE INDEX IF NOT EXISTS idx_hotel_charges_day ON hotel_charges (property_id, charged_on);

-- With extras on the bill a guest can pay more than the room total, so the old "paid <= room total" rule goes.
-- The API now checks paid <= room total + extras.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'hotel_guests'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%paid_amount <= total_amount%' LOOP
    EXECUTE format('ALTER TABLE hotel_guests DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- Money the hotel spends. "paid = false" is a bill still owed to the supplier.
CREATE TABLE IF NOT EXISTS hotel_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  spent_on    date NOT NULL,
  category    text NOT NULL CHECK (category IN ('groceries', 'electricity', 'water', 'gas', 'repairs', 'laundry', 'supplies', 'fuel', 'rent', 'other')),
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  supplier    text,
  method      text CHECK (method IN ('cash', 'upi', 'bank', 'card')),
  paid        boolean NOT NULL DEFAULT true,
  paid_on     date,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_expenses_property ON hotel_expenses (property_id, spent_on);

-- Stock: linen, toiletries, kitchen and cleaning items, with the level at which to buy more.
CREATE TABLE IF NOT EXISTS hotel_stock_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'other' CHECK (category IN ('linen', 'toiletries', 'kitchen', 'cleaning', 'other')),
  unit        text NOT NULL DEFAULT 'pieces',
  qty         numeric(10,2) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  low_level   numeric(10,2) NOT NULL DEFAULT 0 CHECK (low_level >= 0),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_stock_name_uq ON hotel_stock_items (property_id, lower(name));

CREATE TABLE IF NOT EXISTS hotel_stock_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES hotel_stock_items(id) ON DELETE CASCADE,
  change     numeric(10,2) NOT NULL CHECK (change <> 0),
  reason     text NOT NULL CHECK (reason IN ('purchase', 'used', 'damaged', 'correction')),
  qty_after  numeric(10,2) NOT NULL,
  note       text,
  moved_on   date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_stock_moves_item ON hotel_stock_moves (item_id, created_at DESC);
