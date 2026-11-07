-- Age of each child on a booking (at check-out), as chosen in the Guests picker.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS child_ages int[];
