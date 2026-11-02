CREATE TABLE skts_identity_invitations (
  email text PRIMARY KEY,
  requested_by text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK(status IN ('sending','requested','failed','unknown'))
);
