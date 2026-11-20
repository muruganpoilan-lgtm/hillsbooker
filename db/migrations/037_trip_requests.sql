-- "Plan my trip" requests go into the same Enquiries list as group tours and packages.
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_kind_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_kind_check CHECK (kind IN ('group', 'corporate', 'package', 'trip'));
