CREATE TABLE skts_requests (
  reference text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('enquiry','service')),
  customer_email text NOT NULL CHECK (customer_email = lower(customer_email)),
  customer_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  business text NOT NULL DEFAULT '',
  brief text NOT NULL DEFAULT '',
  services text NOT NULL DEFAULT '',
  indicative_total text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','quoted','in_progress','awaiting_client','completed','cancelled')),
  quoted_amount_paise bigint CHECK (quoted_amount_paise > 0),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skts_requests_owner ON skts_requests(customer_email, created_at DESC);
CREATE TABLE skts_request_events (
  id uuid PRIMARY KEY,
  request_reference text NOT NULL REFERENCES skts_requests(reference),
  actor_id text,
  message text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('customer','internal')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skts_events_request ON skts_request_events(request_reference, created_at);
CREATE TABLE skts_payment_references (
  reference text PRIMARY KEY,
  project_reference text NOT NULL,
  customer_email text NOT NULL CHECK (customer_email = lower(customer_email)),
  customer_name text NOT NULL,
  reported_amount_paise bigint NOT NULL CHECK (reported_amount_paise > 0),
  transaction_reference text NOT NULL,
  payment_date date NOT NULL,
  brief text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verified_amount_paise bigint CHECK (verified_amount_paise > 0),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((verification_status = 'verified') = (verified_amount_paise IS NOT NULL))
);
CREATE INDEX skts_payments_owner ON skts_payment_references(customer_email, created_at DESC);
CREATE UNIQUE INDEX skts_verified_transaction ON skts_payment_references (upper(transaction_reference)) WHERE verification_status = 'verified';
CREATE TABLE skts_payment_audit (
  id uuid PRIMARY KEY,
  payment_reference text NOT NULL REFERENCES skts_payment_references(reference),
  actor_id text NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  verified_amount_paise bigint,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
