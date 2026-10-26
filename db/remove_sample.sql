-- Removes everything added by db/seed_sample.sql, seed_sample_more.sql and seed_sample_photos.sql (and any bookings made on it).
-- Afterwards also delete the picture files:  docker compose -f docker-compose.prod.yml exec api rm -rf /data/uploads/sample
--   docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/remove_sample.sql
DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE property_id IN (SELECT id FROM properties WHERE owner_id = '5a000000-0000-4000-8000-000000000001'))
   OR vehicle_booking_id IN (SELECT id FROM vehicle_bookings WHERE vehicle_id IN (SELECT id FROM vehicles WHERE operator_id = '5a000000-0000-4000-8000-000000000001'));
DELETE FROM reviews WHERE property_id IN (SELECT id FROM properties WHERE owner_id = '5a000000-0000-4000-8000-000000000001');
DELETE FROM bookings WHERE property_id IN (SELECT id FROM properties WHERE owner_id = '5a000000-0000-4000-8000-000000000001');
DELETE FROM vehicle_bookings WHERE vehicle_id IN (SELECT id FROM vehicles WHERE operator_id = '5a000000-0000-4000-8000-000000000001');
DELETE FROM properties WHERE owner_id = '5a000000-0000-4000-8000-000000000001';
DELETE FROM vehicles WHERE operator_id = '5a000000-0000-4000-8000-000000000001';
DELETE FROM users WHERE id = '5a000000-0000-4000-8000-000000000001';
