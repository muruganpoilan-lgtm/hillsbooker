-- Hill Booker — listing data tidy-up, run 2. 25 November 2026
--
-- Run 1 rolled back on purpose: the script opened a transaction, printed the
-- listings and ended without COMMIT, so psql's connection closed and Postgres
-- undid everything. The live site still shows "poll villa" and "KANTHALLOOR",
-- which is how we know. This version ends with COMMIT and does save.
--
--   docker compose -f docker-compose.prod.yml exec -T db \
--     psql -U roomly -d roomly -f - < db/fixes/2026-11-25b-tidy-listings-commit.sql
--
-- Safe to run twice: each statement matches only the wrong value.

BEGIN;

-- 1. Typo in a live listing name.
UPDATE properties
   SET name = 'Cassa Don Premium Pool Villa'
 WHERE name = 'Cassa Don Premium poll villa';

-- 2. Kanthaloor is three cities today. city is matched lowercased, so
--    'KANTHALLOOR' and 'Kanthaloor Marayoor' sit in separate buckets and
--    neither matches /stays/kanthaloor.
UPDATE properties
   SET city = 'Kanthaloor'
 WHERE lower(city) IN ('kanthalloor', 'kanthaloor marayoor', 'kanthalloor marayoor');

-- 3. 'Madikeri (Coorg)' slugs to madikeri-coorg, which nothing on the site
--    links to, so the one Coorg property cannot be reached by browsing.
--    The homepage region tile now looks for Madikeri.
UPDATE properties
   SET city = 'Madikeri'
 WHERE lower(city) IN ('madikeri (coorg)', 'madikeri(coorg)', 'madikeri coorg');

-- 4. Any other city stored in block capitals.
UPDATE properties
   SET city = initcap(lower(city))
 WHERE city = upper(city)
   AND city <> initcap(lower(city));

SELECT name, city FROM properties WHERE removed_at IS NULL ORDER BY city, name;

COMMIT;
