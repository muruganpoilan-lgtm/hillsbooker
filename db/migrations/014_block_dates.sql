-- Hosts can block nights from the calendar. A blocked night shows no rooms to guests.
ALTER TABLE room_inventory ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
