-- Suspected spam enquiries are kept but marked, so a wrongly flagged real enquiry can still be found.
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('new', 'contacted', 'won', 'lost', 'spam'));
