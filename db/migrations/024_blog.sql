-- Travel guides (blog). Written by the admin, shown at /blog. Good for Google searches like "best time to visit Munnar".
CREATE TABLE IF NOT EXISTS blog_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  city         text,
  summary      text,
  body         text NOT NULL DEFAULT '',
  published    boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_photos (
  id          serial PRIMARY KEY,
  post_id     uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_key text,
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS blog_photos_idx ON blog_photos (post_id, position);
