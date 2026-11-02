-- Coupon codes. Hill Booker pays for the discount out of its own commission; the host's share does not change.
CREATE TABLE IF NOT EXISTS coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE CHECK (code = upper(code)),
  kind               text NOT NULL CHECK (kind IN ('flat', 'percent')),
  value              numeric(10,2) NOT NULL CHECK (value > 0),      -- rupees off, or percent off the booking total
  max_discount       numeric(10,2),                                  -- ceiling for a percent coupon
  min_total          numeric(10,2) NOT NULL DEFAULT 0,               -- smallest booking total it works on
  valid_until        date,                                           -- last day it can be used (India time); empty = no end date
  max_uses           int,                                            -- all guests together; empty = unlimited
  per_user           int NOT NULL DEFAULT 1,                         -- times one guest can use it
  first_booking_only boolean NOT NULL DEFAULT false,
  user_id            uuid REFERENCES users(id) ON DELETE CASCADE,    -- when set, only this guest can use it
  note               text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- total_amount stays what the guest owes after the coupon, so balance = total - advance is still right everywhere.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
CREATE INDEX IF NOT EXISTS idx_bookings_coupon ON bookings (coupon_id) WHERE coupon_id IS NOT NULL;
