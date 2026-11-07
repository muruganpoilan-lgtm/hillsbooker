-- Bed type and number of beds for each room type (shown to guests with a bed symbol).
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS bed_type text
  CHECK (bed_type IN ('single', 'double', 'queen', 'king', 'twin', 'bunk'));
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS bed_count int NOT NULL DEFAULT 1 CHECK (bed_count BETWEEN 1 AND 10);
