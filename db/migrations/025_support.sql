-- Customer-care tickets sent from hillbooker.com/support. The admin reads them in the dashboard.
CREATE SEQUENCE IF NOT EXISTS support_ticket_no START 1001;
CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no   integer NOT NULL DEFAULT nextval('support_ticket_no') UNIQUE,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  topic       text NOT NULL CHECK (topic IN ('booking', 'payment', 'cancellation', 'vehicle', 'host', 'app', 'other')),
  booking_ref text,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_note  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_idx ON support_tickets (status, created_at DESC);
