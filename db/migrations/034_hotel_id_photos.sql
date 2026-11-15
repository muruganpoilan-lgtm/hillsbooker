-- Manage my hotel: photos of a guest's ID proof (front and back).
-- They are kept inside the database, not in the public uploads folder, so nobody can open them with a link.
-- Only the account that holds the property can read them, through the API, after logging in.
CREATE TABLE IF NOT EXISTS hotel_id_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id   uuid REFERENCES hotel_guests(id) ON DELETE CASCADE,   -- a walk-in guest, or
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,       -- a Hill Booker booking
  side       text NOT NULL CHECK (side IN ('front', 'back')),
  mime       text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(guest_id, booking_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_id_photos_guest_uq ON hotel_id_photos (guest_id, side) WHERE guest_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hotel_id_photos_booking_uq ON hotel_id_photos (booking_id, side) WHERE booking_id IS NOT NULL;
