-- Manage my hotel, part 2: check-in and check-out from the room board, guest address and ID proof,
-- and walk-in guests closing their nights on Hill Booker so the same room cannot be sold twice.

-- Address and ID proof of the guest. For Aadhaar only the last 4 digits are kept (UIDAI's masked Aadhaar).
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS id_type text CHECK (id_type IN ('aadhaar', 'voter', 'driving', 'passport', 'pan', 'other'));
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS id_number text;
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS id_type text CHECK (id_type IN ('aadhaar', 'voter', 'driving', 'passport', 'pan', 'other'));
ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS id_number text;
ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

-- One row per night a walk-in guest keeps a room of a room type. "applied" says the night was taken out of
-- room_inventory (false when no room was open online that night). Works like external_nights for calendar links.
CREATE TABLE IF NOT EXISTS hotel_guest_nights (
  guest_id     uuid NOT NULL REFERENCES hotel_guests(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  day          date NOT NULL,
  applied      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (guest_id, day)
);
CREATE INDEX IF NOT EXISTS idx_hotel_guest_nights_room ON hotel_guest_nights (room_type_id, day);
