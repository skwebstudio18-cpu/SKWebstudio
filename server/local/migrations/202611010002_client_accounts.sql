CREATE TABLE skts_local_clients (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email=lower(email)),
  name text NOT NULL,
  password_hash text,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE skts_local_invites (
  token_hash text PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES skts_local_clients(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE skts_local_sessions ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE skts_local_sessions ADD COLUMN client_id uuid REFERENCES skts_local_clients(id);
ALTER TABLE skts_local_sessions ADD CONSTRAINT skts_session_account CHECK ((owner_id IS NOT NULL AND client_id IS NULL) OR (owner_id IS NULL AND client_id IS NOT NULL));
