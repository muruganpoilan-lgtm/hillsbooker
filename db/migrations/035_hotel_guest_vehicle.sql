-- Manage my hotel: the guest's vehicle (model and registration number), for the hotel's register and parking.
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE hotel_guests ADD COLUMN IF NOT EXISTS vehicle_number text;
ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE hotel_booking_extras ADD COLUMN IF NOT EXISTS vehicle_number text;
