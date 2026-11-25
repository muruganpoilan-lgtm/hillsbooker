-- Hill Booker — listing data tidy-up, 25 November 2026
-- Run it, read the output, then COMMIT or ROLLBACK yourself. Nothing is saved until you do.
--
--   docker compose -f docker-compose.prod.yml exec -T db \
--     psql -U roomly -d roomly -f - < db/fixes/2026-11-25-tidy-listings.sql
--
-- Safe to run twice: every statement matches on the wrong value, so a second run changes nothing.

BEGIN;

-- 1. Typo in a live listing name: "poll villa" -> "Pool Villa"
UPDATE properties
   SET name = 'Cassa Don Premium Pool Villa'
 WHERE name = 'Cassa Don Premium poll villa';

-- 2. Kanthaloor is currently THREE different cities as far as the site is concerned.
--    city is matched lowercased, so 'KANTHALLOOR' and 'Kanthaloor Marayoor' land in
--    separate buckets and neither one matches /stays/kanthaloor. That splits the
--    search results and the homepage counts for the same town.
UPDATE properties
   SET city = 'Kanthaloor'
 WHERE lower(city) IN ('kanthalloor', 'kanthaloor marayoor', 'kanthalloor marayoor');

-- 3. Any other city stored in block capitals loses its shouting but keeps its spelling.
UPDATE properties
   SET city = initcap(lower(city))
 WHERE city = upper(city)
   AND city <> initcap(lower(city));

-- Check before you commit.
SELECT id, name, city, type, status
  FROM properties
 WHERE removed_at IS NULL
 ORDER BY city, name;

-- COMMIT;
-- ROLLBACK;
