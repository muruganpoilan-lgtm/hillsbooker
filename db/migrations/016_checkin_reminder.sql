-- Remembers that the day-before check-in reminder was already sent, so no guest gets it twice.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
