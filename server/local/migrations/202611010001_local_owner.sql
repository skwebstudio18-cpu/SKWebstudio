CREATE TABLE skts_local_owner (
  singleton integer PRIMARY KEY CHECK (singleton = 1),
  id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE skts_local_sessions (
  token_hash text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES skts_local_owner(id),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
