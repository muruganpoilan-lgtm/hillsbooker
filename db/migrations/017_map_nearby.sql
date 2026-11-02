-- A Google Maps link for the property, and a short list of nearby attractions (one per line, for example "Ooty Lake - 3 km").
ALTER TABLE properties ADD COLUMN IF NOT EXISTS map_url text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS nearby text;
