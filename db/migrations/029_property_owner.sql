-- The real owner of a property an admin listed on their behalf: who they are, where to send WhatsApp alerts,
-- and where to pay them. Only admins can see or change these. With a UPI ID or bank account saved here, the
-- property's payouts are paid to this owner separately from the account that holds the listing.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name         text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_whatsapp     text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_upi          text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_account text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_ifsc    text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_bank_holder  text;

-- A payout made to one property's owner (rather than to the account holder) records the property.
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id);
