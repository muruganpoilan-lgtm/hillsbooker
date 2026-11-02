-- Fill in map coordinates for properties whose Google Maps link already contains them (.../@lat,lng,... or !3dLAT!4dLNG).
UPDATE properties
SET lat = (regexp_match(map_url, '@(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)'))[1]::numeric,
    lng = (regexp_match(map_url, '@(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)'))[2]::numeric
WHERE lat IS NULL AND map_url ~ '@-?[0-9]+\.[0-9]+,-?[0-9]+\.[0-9]+';

UPDATE properties
SET lat = (regexp_match(map_url, '!3d(-?[0-9]+\.[0-9]+)!4d(-?[0-9]+\.[0-9]+)'))[1]::numeric,
    lng = (regexp_match(map_url, '!3d(-?[0-9]+\.[0-9]+)!4d(-?[0-9]+\.[0-9]+)'))[2]::numeric
WHERE lat IS NULL AND map_url ~ '!3d-?[0-9]+\.[0-9]+!4d-?[0-9]+\.[0-9]+';
