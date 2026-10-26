-- SAMPLE DATA so the app and website have something to show. Safe to run more than once.
-- Remove it all later with db/remove_sample.sql.
--   docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/seed_sample.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A host account that nobody can log in to (random password).
INSERT INTO users (id, name, email, password_hash, role) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'Sample Host', 'sample-host@hillbooker.com', crypt(gen_random_uuid()::text, gen_salt('bf')), 'owner')
ON CONFLICT (email) DO NOTHING;

-- ---------- vehicles ----------
INSERT INTO vehicles (id, operator_id, name, kind, seats, ac, city, description, price_per_day, km_per_day, extra_km_rate, quantity, status, advance_percent) VALUES
 ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-000000000001', 'Maruti Swift Dzire', 'car', 4, true, 'Munnar',
  'Clean, comfortable sedan with an experienced local driver. Good for couples and small families.', 2500, 250, 12, 3, 'approved', 30),
 ('5a000000-0000-4000-8000-0000000000a2', '5a000000-0000-4000-8000-000000000001', 'Toyota Innova Crysta', 'suv', 7, true, 'Munnar',
  'Spacious 7-seater with luggage space for ghat roads and sightseeing days.', 3800, 250, 15, 2, 'approved', 30),
 ('5a000000-0000-4000-8000-0000000000a3', '5a000000-0000-4000-8000-000000000001', 'Tempo Traveller 12 Seater', 'traveller', 12, true, 'Ooty',
  'Push-back seats, music system and a driver who knows every viewpoint. Ideal for family groups.', 6500, 300, 20, 2, 'approved', 30),
 ('5a000000-0000-4000-8000-0000000000a4', '5a000000-0000-4000-8000-000000000001', 'Mini Bus 20 Seater', 'mini_bus', 20, true, 'Kodaikanal',
  'Comfortable 20-seat AC mini bus for tours, weddings and school or office trips.', 9500, 300, 28, 1, 'approved', 50),
 ('5a000000-0000-4000-8000-0000000000a5', '5a000000-0000-4000-8000-000000000001', 'Mahindra Bolero', 'suv', 7, false, 'Valparai',
  'Tough 4x4 style SUV for estate and forest roads around Valparai.', 3000, 200, 14, 2, 'approved', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vehicle_trips (id, vehicle_id, title, from_place, to_place, details, price) VALUES
 ('5a000000-0000-4000-8000-0000000000b1', '5a000000-0000-4000-8000-0000000000a1', 'Munnar sightseeing, one day', 'Munnar', 'Munnar', '8 hours: Mattupetty, Echo Point, tea gardens, Top Station', 3200),
 ('5a000000-0000-4000-8000-0000000000b2', '5a000000-0000-4000-8000-0000000000a1', 'Cochin airport drop', 'Cochin Airport', 'Munnar', 'About 4.5 hours, one way', 4200),
 ('5a000000-0000-4000-8000-0000000000b3', '5a000000-0000-4000-8000-0000000000a2', 'Munnar sightseeing, one day', 'Munnar', 'Munnar', '8 hours, up to 7 passengers', 4500),
 ('5a000000-0000-4000-8000-0000000000b4', '5a000000-0000-4000-8000-0000000000a2', 'Munnar to Thekkady', 'Munnar', 'Thekkady', 'About 4 hours, one way', 5200),
 ('5a000000-0000-4000-8000-0000000000b5', '5a000000-0000-4000-8000-0000000000a3', 'Ooty full-day tour', 'Ooty', 'Ooty', '10 hours: Botanical Garden, Doddabetta, lake, tea factory', 7500),
 ('5a000000-0000-4000-8000-0000000000b6', '5a000000-0000-4000-8000-0000000000a3', 'Coimbatore airport drop', 'Coimbatore Airport', 'Ooty', 'About 4 hours, one way', 6800),
 ('5a000000-0000-4000-8000-0000000000b7', '5a000000-0000-4000-8000-0000000000a4', 'Kodaikanal local sightseeing', 'Kodaikanal', 'Kodaikanal', '8 hours: Pillar Rocks, Coaker''s Walk, lake, Pine Forest', 10500),
 ('5a000000-0000-4000-8000-0000000000b8', '5a000000-0000-4000-8000-0000000000a5', 'Valparai estates and Nallamudi view', 'Valparai', 'Valparai', '6 hours, tea estate roads and viewpoint', 3600)
ON CONFLICT (id) DO NOTHING;

-- ---------- two properties with rooms ----------
INSERT INTO properties (id, owner_id, name, type, description, city, address, status, advance_percent) VALUES
 ('5a000000-0000-4000-8000-0000000000c1', '5a000000-0000-4000-8000-000000000001', 'Misty Valley Homestay', 'homestay',
  'A quiet family-run homestay among tea estates, with home-cooked meals and mountain views from every room.', 'Munnar', 'Near Chithirapuram, Munnar', 'approved', 30),
 ('5a000000-0000-4000-8000-0000000000c2', '5a000000-0000-4000-8000-000000000001', 'Pine Hill Resort', 'resort',
  'Cottages in a pine forest, a short walk from the lake, with a restaurant and bonfire evenings.', 'Kodaikanal', 'Lake Road, Kodaikanal', 'approved', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO room_types (id, property_id, name, max_guests, base_price, total_rooms) VALUES
 ('5a000000-0000-4000-8000-0000000000d1', '5a000000-0000-4000-8000-0000000000c1', 'Standard double room', 2, 2200, 4),
 ('5a000000-0000-4000-8000-0000000000d2', '5a000000-0000-4000-8000-0000000000c1', 'Family room with valley view', 4, 3600, 2),
 ('5a000000-0000-4000-8000-0000000000d3', '5a000000-0000-4000-8000-0000000000c2', 'Deluxe cottage', 3, 4200, 5),
 ('5a000000-0000-4000-8000-0000000000d4', '5a000000-0000-4000-8000-0000000000c2', 'Family cottage', 5, 6200, 3)
ON CONFLICT (id) DO NOTHING;

-- Open the next 180 nights for each sample room type.
INSERT INTO room_inventory (room_type_id, day, available)
SELECT rt.id, d::date, rt.total_rooms
FROM room_types rt, generate_series(current_date, current_date + 180, interval '1 day') d
WHERE rt.id IN ('5a000000-0000-4000-8000-0000000000d1','5a000000-0000-4000-8000-0000000000d2','5a000000-0000-4000-8000-0000000000d3','5a000000-0000-4000-8000-0000000000d4')
ON CONFLICT (room_type_id, day) DO NOTHING;
