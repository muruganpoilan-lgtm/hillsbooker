-- Invite a friend. Each account gets its own code (made the first time they open the Invite page).
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id);

-- One row per invited friend. rewarded_at is set when the inviter's reward coupon is issued.
CREATE TABLE IF NOT EXISTS referrals (
  referred_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referrer_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  rewarded_at      timestamptz,
  reward_coupon_id uuid REFERENCES coupons(id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);

-- Coupons made by the invite programme are kept apart from the ones the admin creates.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin';
